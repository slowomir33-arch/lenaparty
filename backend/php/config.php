<?php

const APP_VERSION = 'php-upload-v1';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
];

const THUMBNAIL_SIZE = 400;

const STORAGE_ROOT = __DIR__ . '/..';
const UPLOADS_DIR = STORAGE_ROOT . '/uploads';
const ALBUMS_DIR = UPLOADS_DIR . '/albums';
const THUMBNAILS_DIR = UPLOADS_DIR . '/thumbnails';
const DATA_DIR = STORAGE_ROOT . '/data';
const DATA_FILE = DATA_DIR . '/albums.json';

if (!is_dir(UPLOADS_DIR)) {
    mkdir(UPLOADS_DIR, 0775, true);
}
if (!is_dir(ALBUMS_DIR)) {
    mkdir(ALBUMS_DIR, 0775, true);
}
if (!is_dir(THUMBNAILS_DIR)) {
    mkdir(THUMBNAILS_DIR, 0775, true);
}
if (!is_dir(DATA_DIR)) {
    mkdir(DATA_DIR, 0775, true);
}
if (!file_exists(DATA_FILE)) {
    file_put_contents(DATA_FILE, json_encode(['albums' => []], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}
