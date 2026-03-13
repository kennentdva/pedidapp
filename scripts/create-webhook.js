// Script para crear el webhook de base de datos en Supabase via Management API
// Ref: https://api.supabase.com/api/v1#tag/database-webhooks/post/v1/projects/{ref}/database/webhooks

const PROJECT_REF = 'hvhxdsukldgezqwtlwcc';

async function createWebhook(accessToken) {
  const webhookUrl = `https://hvhxdsukldgezqwtlwcc.supabase.co/functions/v1/send-push`;
  
  const body = {
    name: 'push_on_new_pedido',
    enabled: true,
    function_name: 'notify_new_pedido',
    function_schema: 'public',
    events: ['INSERT'],
    schema: 'public',
    table: 'pedidos',
    service_url: webhookUrl,
    headers: [{ name: 'Content-Type', value: 'application/json' }],
    payload: null
  };

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/webhooks`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body)
    }
  );
  
  const data = await res.json();
  console.log('STATUS:', res.status);
  console.log('RESPONSE:', JSON.stringify(data, null, 2));
}

// Get token from Supabase CLI config
const fs = require('fs');
const os = require('os');
const path = require('path');

// Try to find the access token from Supabase CLI config
const configPaths = [
  path.join(os.homedir(), '.config', 'supabase', 'access-token'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'supabase', 'access-token'),
  path.join(os.homedir(), '.supabase', 'access-token'),
];

let token = null;
for (const p of configPaths) {
  if (fs.existsSync(p)) {
    token = fs.readFileSync(p, 'utf8').trim();
    console.log('Found token at:', p);
    break;
  }
}

// Also check supabase config.toml
const tomlPaths = [
  path.join(os.homedir(), '.config', 'supabase', 'config.toml'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'supabase', 'config.toml'),
];
for (const p of tomlPaths) {
  if (fs.existsSync(p)) {
    console.log('Config found at:', p);
    const content = fs.readFileSync(p, 'utf8');
    const match = content.match(/access_token\s*=\s*"([^"]+)"/);
    if (match) { token = match[1]; break; }
  }
}

if (!token) {
  console.log('Token not found. Listing config dirs...');
  const dirs = [path.join(os.homedir(), '.config'), path.join(os.homedir(), 'AppData', 'Roaming')];
  for (const d of dirs) {
    if (fs.existsSync(d)) {
      const entries = fs.readdirSync(d).filter(e => e.toLowerCase().includes('supa'));
      if (entries.length) console.log('Found in', d, ':', entries);
    }
  }
} else {
  createWebhook(token);
}
