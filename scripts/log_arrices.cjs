
const URL = 'https://hvhxdsukldgezqwtlwcc.supabase.co/rest/v1/pedidos?select=*&limit=1000';
const KEY = 'sb_publishable_-A2tJZgxAoAmPwoe1xLSzA_7dnN02Xn';
const fs = require('fs');
const path = require('path');

async function run() {
  const res = await fetch(URL, { headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` } });
  const pedidos = await res.json();
  let log = "";
  
  pedidos.forEach(p => {
    const items = (p.detalle && p.detalle.items) || [p.detalle];
    items.forEach(it => {
        if (!it || !it.proteina) return;
        const prot = it.proteina.toLowerCase();
        if (prot.includes('arroz') || prot.includes('trifasico') || prot.includes('cubano') || prot.includes('pollo')) {
            const val = it.valor || (p.valor / (items.length || 1));
            log += `ID: ${p.id.slice(0,8)} | Qty: ${it.cantidad || 1} | Prot: ${it.proteina} | Val: ${val} | Date: ${p.created_at}\n`;
        }
    });
  });
  const logPath = path.join(process.cwd(), 'arroz_log.txt');
  fs.writeFileSync(logPath, log);
  console.log("Logged", log.split('\n').length - 1, "entries to", logPath);
}
run();
