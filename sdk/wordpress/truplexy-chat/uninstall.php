<?php
/**
 * Runs when the plugin is deleted from the Plugins screen: removes the saved settings.
 * The per-visitor rate-limit transients last one minute and expire on their own.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

delete_option('truplexy_chat');
