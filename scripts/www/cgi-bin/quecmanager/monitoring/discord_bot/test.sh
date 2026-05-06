#!/bin/sh
. /usr/lib/qmanager/cgi_base.sh
. /usr/lib/qmanager/discord_alerts.sh

qlog_init "cgi_discord_test"
cgi_headers
cgi_handle_options

if [ "$REQUEST_METHOD" = "POST" ]; then
    if ! da_is_installed; then
        jq -n '{success:false, error:"Bot binary not installed"}'
        exit 0
    fi
    if ! da_is_connected; then
        jq -n '{success:false, error:"Bot is not connected to Discord"}'
        exit 0
    fi
    # Signal the bot to send a test DM by writing a trigger file
    printf '{"action":"test_dm","ts":%s}' "$(date +%s)" > /tmp/qmanager_discord_test
    jq -n '{success:true, detail:"Test DM requested. Check your Discord DMs."}'
fi
