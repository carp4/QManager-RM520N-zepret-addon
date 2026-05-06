#!/bin/sh
. /usr/lib/qmanager/cgi_base.sh
. /usr/lib/qmanager/discord_alerts.sh

qlog_init "cgi_discord_status"
cgi_headers
cgi_handle_options

if [ "$REQUEST_METHOD" = "GET" ]; then
    status_json=$(da_bot_status_json)
    installed="false"
    da_is_installed && installed="true"
    printf '%s' "$status_json" | jq --argjson installed "$installed" '. + {success:true, installed:$installed}'
fi
