<?php

require_once __DIR__ . '/helpers.php';

$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Origin, X-Requested-With, Content-Type, Accept, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$segments = array_values(array_filter(explode('/', trim($path, '/'))));

if (empty($segments) || $segments[0] !== 'api') {
    send_error(404, 'Endpoint nie znaleziony');
}

try {
    if ($method === 'GET' && count($segments) === 2 && $segments[1] === 'health') {
        handle_health();
    }

    if ($method === 'GET' && count($segments) === 2 && $segments[1] === 'albums') {
        handle_list_albums();
    }

    if ($method === 'GET' && count($segments) === 3 && $segments[1] === 'albums') {
        handle_get_album($segments[2]);
    }

    if ($method === 'GET' && count($segments) === 4 && $segments[1] === 'albums' && $segments[3] === 'download') {
        handle_album_zip($segments[2]);
    }

    if ($method === 'POST' && count($segments) === 2 && $segments[1] === 'download-multiple') {
        handle_multi_download();
    }

    if ($method === 'POST' && count($segments) === 2 && $segments[1] === 'albums') {
        handle_create_album();
    }

    if ($method === 'PUT' && count($segments) === 3 && $segments[1] === 'albums') {
        handle_update_album($segments[2]);
    }

    if ($method === 'DELETE' && count($segments) === 3 && $segments[1] === 'albums') {
        handle_delete_album($segments[2]);
    }

    if ($method === 'POST' && count($segments) === 4 && $segments[1] === 'albums' && $segments[3] === 'photos') {
        handle_append_photos($segments[2]);
    }

    if ($method === 'POST' && count($segments) === 2 && $segments[1] === 'upload') {
        handle_bulk_upload();
    }

    send_error(404, 'Endpoint nie znaleziony');
} catch (RuntimeException $e) {
    send_error(400, $e->getMessage());
} catch (Throwable $e) {
    error_log('PHP API error: ' . $e->getMessage());
    send_error(500, 'Wewnętrzny błąd serwera');
}

function handle_health(): void {
    send_json(200, [
        'status' => 'ok',
        'timestamp' => gmdate('c'),
        'version' => APP_VERSION,
        'storage' => [
            'mode' => 'local',
            'albumsPath' => ALBUMS_DIR,
        ],
    ]);
}

function handle_list_albums(): void {
    $data = read_albums_data();
    send_json(200, $data['albums']);
}

function handle_get_album(string $albumId): void {
    $data = read_albums_data();
    foreach ($data['albums'] as $album) {
        if ($album['id'] === $albumId) {
            send_json(200, $album);
        }
    }
    send_error(404, 'Album nie znaleziony');
}

function handle_create_album(): void {
    $payload = read_json_body();
    $name = isset($payload['name']) ? trim($payload['name']) : '';
    if ($name === '') {
        send_error(400, 'Nazwa albumu jest wymagana');
    }

    $data = read_albums_data();
    $albumId = generate_uuid();
    $now = gmdate('c');

    $albumPath = ALBUMS_DIR . '/' . $albumId;
    ensure_directory($albumPath . '/light');
    ensure_directory($albumPath . '/max');

    $album = [
        'id' => $albumId,
        'name' => $name,
        'thumbnail' => '',
        'photos' => [],
        'hasLightMax' => false,
        'createdAt' => $now,
        'updatedAt' => $now,
    ];

    $data['albums'][] = $album;
    write_albums_data($data);

    send_json(201, $album);
}

function handle_update_album(string $albumId): void {
    $payload = read_json_body();
    $name = isset($payload['name']) ? trim($payload['name']) : '';

    $data = read_albums_data();
    $index = find_album_index($data['albums'], $albumId);
    if ($index === -1) {
        send_error(404, 'Album nie znaleziony');
    }

    if ($name !== '') {
        $data['albums'][$index]['name'] = $name;
    }
    $data['albums'][$index]['updatedAt'] = gmdate('c');
    write_albums_data($data);

    send_json(200, $data['albums'][$index]);
}

function handle_delete_album(string $albumId): void {
    $data = read_albums_data();
    $index = find_album_index($data['albums'], $albumId);
    if ($index === -1) {
        send_error(404, 'Album nie znaleziony');
    }

    $albumPath = ALBUMS_DIR . '/' . $albumId;
    $thumbPath = THUMBNAILS_DIR . '/' . $albumId;
    delete_path($albumPath);
    delete_path($thumbPath);

    array_splice($data['albums'], $index, 1);
    write_albums_data($data);

    send_json(200, ['message' => 'Album usunięty', 'id' => $albumId]);
}

function handle_bulk_upload(): void {
    $albumName = isset($_POST['albumName']) ? trim($_POST['albumName']) : '';
    if ($albumName === '') {
        send_error(400, 'Nazwa albumu jest wymagana');
    }

    $files = collect_uploaded_files('photos');
    if (empty($files)) {
        send_error(400, 'Brak plików do uploadu');
    }

    $data = read_albums_data();
    $albumId = generate_uuid();
    $now = gmdate('c');

    $album = [
        'id' => $albumId,
        'name' => $albumName,
        'thumbnail' => '',
        'photos' => [],
        'hasLightMax' => false,
        'createdAt' => $now,
        'updatedAt' => $now,
    ];

    $newPhotos = ingest_files_into_album($albumId, $files, $album);
    $album['photos'] = array_merge($album['photos'], $newPhotos);
    if (!$album['thumbnail'] && !empty($album['photos'])) {
        $album['thumbnail'] = $album['photos'][0]['thumbnail'];
    }

    $album['updatedAt'] = gmdate('c');
    $data['albums'][] = $album;
    write_albums_data($data);

    send_json(201, [
        'message' => sprintf('Album "%s" utworzony z %d zdjęciami', $albumName, count($album['photos'])),
        'album' => $album,
        'structure' => $album['hasLightMax'] ? 'light/max' : 'flat',
    ]);
}

function handle_append_photos(string $albumId): void {
    $files = collect_uploaded_files('photos');
    if (empty($files)) {
        send_error(400, 'Brak plików do uploadu');
    }

    $data = read_albums_data();
    $index = find_album_index($data['albums'], $albumId);
    if ($index === -1) {
        send_error(404, 'Album nie znaleziony');
    }

    $album =& $data['albums'][$index];
    $newPhotos = ingest_files_into_album($albumId, $files, $album);

    $album['photos'] = array_merge($album['photos'], $newPhotos);
    if (!$album['thumbnail'] && !empty($album['photos'])) {
        $album['thumbnail'] = $album['photos'][0]['thumbnail'];
    }
    $album['updatedAt'] = gmdate('c');

    $data['albums'][$index] = $album;
    write_albums_data($data);

    send_json(201, [
        'message' => sprintf('Dodano %d zdjęć do albumu', count($newPhotos)),
        'photos' => $newPhotos,
    ]);
}

function handle_album_zip(string $albumId): void {
    $data = read_albums_data();
    $index = find_album_index($data['albums'], $albumId);
    if ($index === -1) {
        send_error(404, 'Album nie znaleziony');
    }

    $album = $data['albums'][$index];
    $albumPath = ALBUMS_DIR . '/' . $albumId;
    $lightPath = $albumPath . '/light';
    $maxPath = $albumPath . '/max';

    $zipName = 'Lena ' . $album['name'] . '.zip';

    stream_zip($zipName, function (ZipArchive $zip) use ($album, $albumPath, $lightPath, $maxPath) {
        $hasLightMax = is_dir($lightPath) && is_dir($maxPath);
        if ($hasLightMax) {
            $lightFolder = 'Lena ' . $album['name'] . ' - Light - do dzielenia się w internecie';
            $maxFolder = 'Lena ' . $album['name'] . ' - Max - do profesjonalnych wydruków';
            add_folder_to_zip($zip, $lightPath, $lightFolder);
            add_folder_to_zip($zip, $maxPath, $maxFolder);
        } else {
            add_folder_to_zip($zip, $albumPath, 'Lena ' . $album['name']);
        }
    });
}

function handle_multi_download(): void {
    $payload = read_json_body();
    $albumIds = isset($payload['albumIds']) && is_array($payload['albumIds']) ? $payload['albumIds'] : [];
    if (empty($albumIds)) {
        send_error(400, 'Brak albumów do pobrania');
    }

    $data = read_albums_data();
    $albums = array_values(array_filter($data['albums'], function ($album) use ($albumIds) {
        return in_array($album['id'], $albumIds, true);
    }));
    if (empty($albums)) {
        send_error(404, 'Nie znaleziono albumów');
    }

    $zipName = count($albums) === 1 ? 'Lena ' . $albums[0]['name'] . '.zip' : 'Lena Galeria.zip';

    stream_zip($zipName, function (ZipArchive $zip) use ($albums) {
        foreach ($albums as $album) {
            $albumPath = ALBUMS_DIR . '/' . $album['id'];
            $lightPath = $albumPath . '/light';
            $maxPath = $albumPath . '/max';
            $hasLightMax = is_dir($lightPath) && is_dir($maxPath);
            if ($hasLightMax) {
                $lightFolder = 'Lena ' . $album['name'] . ' - Light - do dzielenia się w internecie';
                $maxFolder = 'Lena ' . $album['name'] . ' - Max - do profesjonalnych wydruków';
                add_folder_to_zip($zip, $lightPath, $lightFolder);
                add_folder_to_zip($zip, $maxPath, $maxFolder);
            } else {
                add_folder_to_zip($zip, $albumPath, 'Lena ' . $album['name']);
            }
        }
    });
}

function ingest_files_into_album(string $albumId, array $files, array &$albumMeta): array {
    $albumPath = ALBUMS_DIR . '/' . $albumId;
    $lightPath = $albumPath . '/light';
    $maxPath = $albumPath . '/max';
    ensure_directory($albumPath);

    $groups = [
        'light' => [],
        'max' => [],
        'other' => [],
    ];

    foreach ($files as $file) {
        validate_uploaded_file($file);
        list($folderType, $cleanName) = parse_upload_path($file['name']);
        $entry = [
            'file' => $file,
            'name' => sanitize_filename($cleanName),
        ];
        if ($folderType === 'light') {
            $groups['light'][] = $entry;
        } elseif ($folderType === 'max') {
            $groups['max'][] = $entry;
        } else {
            $groups['other'][] = $entry;
        }
    }

    function read_json_body(): array {
        $raw = file_get_contents('php://input');
        if ($raw === false || $raw === '') {
            return [];
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            throw new RuntimeException('Nieprawidłowe dane JSON');
        }
        return $data;
    }

    function find_album_index(array $albums, string $albumId): int {
        foreach ($albums as $index => $album) {
            if (($album['id'] ?? null) === $albumId) {
                return (int) $index;
            }
        }
        return -1;
    }

    function delete_path(string $path): void {
        if (!file_exists($path)) {
            return;
        }
        if (is_file($path) || is_link($path)) {
            @unlink($path);
            return;
        }
        $items = new FilesystemIterator($path);
        foreach ($items as $item) {
            delete_path($item->getPathname());
        }
        @rmdir($path);
    }

    $hasLightBatch = count($groups['light']) > 0;
    $hasMaxBatch = count($groups['max']) > 0;
    $requiresStructure = !empty($albumMeta['hasLightMax']);

    // Enforce light/max uploads once an album is flagged as structured
    if ($requiresStructure && (!$hasLightBatch || !$hasMaxBatch)) {
        throw new RuntimeException('Album wymaga wysyłki w strukturze light/max');
    }

    $useLightMax = ($hasLightBatch && $hasMaxBatch) || $requiresStructure;
    $newPhotos = [];

    if ($useLightMax) {
        ensure_directory($lightPath);
        ensure_directory($maxPath);

        foreach ($groups['light'] as $entry) {
            $targetName = get_unique_filename($lightPath, $entry['name']);
            $targetPath = $lightPath . '/' . $targetName;
            if (!move_uploaded_file($entry['file']['tmp_name'], $targetPath)) {
                throw new RuntimeException('Nie można zapisać pliku light');
            }
            $thumbPath = create_thumbnail($targetPath, $albumId, $targetName);
            list($width, $height) = get_image_dimensions($targetPath);
            $newPhotos[] = [
                'id' => generate_uuid(),
                'src' => '/uploads/albums/' . $albumId . '/light/' . $targetName,
                'thumbnail' => to_public_path($thumbPath),
                'title' => pathinfo($targetName, PATHINFO_FILENAME),
                'width' => $width,
                'height' => $height,
                'uploadedAt' => gmdate('c'),
            ];
        }

        foreach ($groups['max'] as $entry) {
            $targetName = get_unique_filename($maxPath, $entry['name']);
            $targetPath = $maxPath . '/' . $targetName;
            if (!move_uploaded_file($entry['file']['tmp_name'], $targetPath)) {
                throw new RuntimeException('Nie można zapisać pliku max');
            }
        }

        $albumMeta['hasLightMax'] = true;
    } else {
        // Legacy mode accepts any images and keeps them in the root album directory
        $flatFiles = !empty($groups['other']) ? $groups['other'] : array_merge($groups['light'], $groups['max']);
        foreach ($flatFiles as $entry) {
            $targetName = get_unique_filename($albumPath, $entry['name']);
            $targetPath = $albumPath . '/' . $targetName;
            if (!move_uploaded_file($entry['file']['tmp_name'], $targetPath)) {
                throw new RuntimeException('Nie można zapisać pliku');
            }
            $thumbPath = create_thumbnail($targetPath, $albumId, $targetName);
            list($width, $height) = get_image_dimensions($targetPath);
            $newPhotos[] = [
                'id' => generate_uuid(),
                'src' => '/uploads/albums/' . $albumId . '/' . $targetName,
                'thumbnail' => to_public_path($thumbPath),
                'title' => pathinfo($targetName, PATHINFO_FILENAME),
                'width' => $width,
                'height' => $height,
                'uploadedAt' => gmdate('c'),
            ];
        }
    }

    return $newPhotos;
}