<?php

require_once __DIR__ . '/config.php';

function send_json(int $status, array $payload): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function send_error(int $status, string $message): void {
    send_json($status, ['error' => $message]);
}

function read_albums_data(): array {
    $raw = file_get_contents(DATA_FILE);
    $data = json_decode($raw ?: '{}', true);
    if (!is_array($data)) {
        $data = ['albums' => []];
    }
    if (!isset($data['albums']) || !is_array($data['albums'])) {
        $data['albums'] = [];
    }
    return $data;
}

function write_albums_data(array $data): void {
    file_put_contents(DATA_FILE, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function generate_uuid(): string {
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function sanitize_filename(string $filename): string {
    $path = explode('/', str_replace('\\', '/', $filename));
    $name = end($path);
    $ext = pathinfo($name, PATHINFO_EXTENSION);
    $base = pathinfo($name, PATHINFO_FILENAME);
    $base = preg_replace('/[<>:"\\\/|?*]/', '_', $base);
    $base = preg_replace('/\s+/', ' ', $base);
    $base = trim($base);
    if ($base === '') {
        $base = 'photo';
    }
    return $ext ? $base . '.' . $ext : $base;
}

function get_unique_filename(string $dir, string $filename): string {
    $ext = pathinfo($filename, PATHINFO_EXTENSION);
    $base = pathinfo($filename, PATHINFO_FILENAME);
    $candidate = $filename;
    $counter = 1;
    while (file_exists($dir . DIRECTORY_SEPARATOR . $candidate)) {
        $suffix = ' (' . $counter . ')';
        $candidate = $ext ? $base . $suffix . '.' . $ext : $base . $suffix;
        $counter++;
    }
    return $candidate;
}

function parse_upload_path(string $filename): array {
    $segments = array_values(array_filter(array_map('trim', explode('___', str_replace(['\\', '/'], '___', $filename))), function($part) { return $part !== ''; }));
    $cleanName = $segments ? array_pop($segments) : $filename;
    $folderType = '';
    for ($i = count($segments) - 1; $i >= 0; $i--) {
        $segment = strtolower($segments[$i]);
        if ($segment === 'light' || $segment === 'max') {
            $folderType = $segment;
            break;
        }
    }
    return [$folderType, $cleanName];
}

function collect_uploaded_files(string $field): array {
    if (!isset($_FILES[$field])) {
        return [];
    }
    $files = [];
    $entry = $_FILES[$field];
    if (is_array($entry['name'])) {
        $count = count($entry['name']);
        for ($i = 0; $i < $count; $i++) {
            $files[] = [
                'name' => $entry['name'][$i],
                'type' => $entry['type'][$i],
                'tmp_name' => $entry['tmp_name'][$i],
                'error' => $entry['error'][$i],
                'size' => $entry['size'][$i],
            ];
        }
    } else {
        $files[] = $entry;
    }
    return $files;
}

function ensure_directory(string $path): void {
    if (!is_dir($path)) {
        mkdir($path, 0775, true);
    }
}

function create_thumbnail(string $sourcePath, string $albumId, string $thumbnailName): string {
    $ext = strtolower(pathinfo($sourcePath, PATHINFO_EXTENSION));
    switch ($ext) {
        case 'jpg':
        case 'jpeg':
            $image = imagecreatefromjpeg($sourcePath);
            break;
        case 'png':
            $image = imagecreatefrompng($sourcePath);
            break;
        case 'webp':
            if (!function_exists('imagecreatefromwebp')) {
                throw new RuntimeException('WebP not supported on server');
            }
            $image = imagecreatefromwebp($sourcePath);
            break;
        case 'gif':
            $image = imagecreatefromgif($sourcePath);
            break;
        default:
            throw new RuntimeException('Unsupported image type for thumbnails');
    }
    $width = imagesx($image);
    $height = imagesy($image);
    $targetSize = THUMBNAIL_SIZE;
    $ratio = min($targetSize / $width, $targetSize / $height);
    $newWidth = max(1, (int) floor($width * $ratio));
    $newHeight = max(1, (int) floor($height * $ratio));
    $canvas = imagecreatetruecolor($targetSize, $targetSize);
    $bg = imagecolorallocate($canvas, 0, 0, 0);
    imagefill($canvas, 0, 0, $bg);
    $dstX = (int) floor(($targetSize - $newWidth) / 2);
    $dstY = (int) floor(($targetSize - $newHeight) / 2);
    imagecopyresampled($canvas, $image, $dstX, $dstY, 0, 0, $newWidth, $newHeight, $width, $height);
    $thumbDir = THUMBNAILS_DIR . '/' . $albumId;
    ensure_directory($thumbDir);
    $thumbPath = $thumbDir . '/' . pathinfo($thumbnailName, PATHINFO_FILENAME) . '.jpg';
    imagejpeg($canvas, $thumbPath, 80);
    imagedestroy($canvas);
    imagedestroy($image);
    return $thumbPath;
}

function get_image_dimensions(string $path): array {
    $info = getimagesize($path);
    if (!$info) {
        return [0, 0];
    }
    return [$info[0], $info[1]];
}

function add_folder_to_zip(ZipArchive $zip, string $folderPath, string $zipPath): void {
    $folderPath = rtrim($folderPath, DIRECTORY_SEPARATOR);
    if (!is_dir($folderPath)) {
        return;
    }
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($folderPath, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    foreach ($iterator as $file) {
        /** @var SplFileInfo $file */
        if ($file->isDir()) {
            $localName = $zipPath . '/' . $iterator->getSubPathname();
            $zip->addEmptyDir($localName);
        } else {
            $localName = $zipPath . '/' . $iterator->getSubPathname();
            $zip->addFile($file->getPathname(), $localName);
        }
    }
}

function to_public_path(string $path): string {
    $root = str_replace('\\', '/', realpath(STORAGE_ROOT));
    $absolute = str_replace('\\', '/', realpath($path) ?: $path);
    if (strpos($absolute, $root) === 0) {
        $relative = substr($absolute, strlen($root));
        if ($relative === '') {
            return '/';
        }
        $normalized = str_replace('\\', '/', $relative);
        return $normalized[0] === '/' ? $normalized : '/' . ltrim($normalized, '/');
    }
    $normalized = str_replace('\\', '/', $path);
    return $normalized[0] === '/' ? $normalized : '/' . ltrim($normalized, '/');
}

function stream_zip(string $zipFilename, callable $builder): void {
    $tmp = tempnam(sys_get_temp_dir(), 'zip');
    $zip = new ZipArchive();
    if ($zip->open($tmp, ZipArchive::OVERWRITE | ZipArchive::CREATE) !== true) {
        throw new RuntimeException('Cannot create ZIP archive');
    }
    $builder($zip);
    $zip->close();
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . rawurlencode($zipFilename) . '"');
    header('Content-Length: ' . filesize($tmp));
    readfile($tmp);
    unlink($tmp);
    exit;
}

function validate_uploaded_file(array $file): void {
    if ($file['error'] !== UPLOAD_ERR_OK) {
        throw new RuntimeException('File upload error code: ' . $file['error']);
    }
    if ($file['size'] > MAX_FILE_SIZE) {
        throw new RuntimeException('File too large');
    }
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $detected = $finfo ? finfo_file($finfo, $file['tmp_name']) : ($file['type'] ?? '');
    if ($finfo) {
        finfo_close($finfo);
    }
    if (!in_array($detected, ALLOWED_MIME_TYPES, true)) {
        throw new RuntimeException('Unsupported MIME type: ' . $detected);
    }
}
