<?php

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (strpos($path, '/api') === 0) {
    require __DIR__ . '/index.php';
    return true;
}

return false;
