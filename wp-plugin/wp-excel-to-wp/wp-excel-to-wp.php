<?php
/**
 * Plugin Name: Excel To WP
 * Description: A plugin to convert excel rows to wordpress fields
 * Version: 0.1
 * Author: DropIN Solutions (Vikas Singh c.2024)
 * Author URI: https://dropinsolutions.org.au
 * License: Free for all
 */


 function showTool() {   
    echo "<iframe style=\"width:100%;height:800px;border=0;\"
  src=\"https://d2zxuvf8am0ctw.cloudfront.net\"></iframe>";
  }

  function addExcelToWpToMenu() {
    add_menu_page('Import Excel', 'Import Excel', 10, __FILE__, 'showTool');
  }

  add_action('admin_menu', 'addExcelToWpToMenu');