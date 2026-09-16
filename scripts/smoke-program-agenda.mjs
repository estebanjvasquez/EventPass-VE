import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const source = readFileSync(
  new URL("../frontend/.env.production", import.meta.url),
  "utf8",
);
const env = Object.fromEntries(
  source
    .split(/\r?\n/)
    .filter((l) => /^VITE_/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i),
        l
          .slice(i + 1)
          .trim()
          .replace(/^['"]|['"]$/g, ""),
      ];
    }),
);
const headers = {
  apikey: env.VITE_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
};
async function rpc(body) {
  const response = await fetch(
    `${env.VITE_SUPABASE_URL}/rest/v1/rpc/get_public_program_agenda`,
    { method: "POST", headers, body: JSON.stringify(body) },
  );
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return data;
}
const forum = await rpc({ p_event_id: "47ad0375-24dd-4f40-80c0-500f4362767c" });
assert.ok(forum.events[0].sessions.length > 0);
const program = await rpc({
  p_program_id: "8f84c7bf-384c-4756-8b47-bde4306642a3",
});
assert.equal(program.config.title, "Programa general");
assert.ok(
  program.events.some((e) => e.id === "276e4d25-b107-4393-9530-542db8ed03a3"),
);
assert.ok(
  program.events.some(
    (e) =>
      e.id === "47ad0375-24dd-4f40-80c0-500f4362767c" && e.sessions.length > 0,
  ),
);
const linked = await rpc({
  p_event_id: "276e4d25-b107-4393-9530-542db8ed03a3",
});
assert.equal(linked.name, program.name);
const own = await rpc({
  p_event_id: "276e4d25-b107-4393-9530-542db8ed03a3",
  p_event_only: true,
});
assert.equal(own.events.length, 1);
assert.equal(own.name, "Expo Energia 2026");
const pending = await rpc({
  p_program_id: "5bef4079-0345-4468-aad7-555483345cc3",
});
assert.equal(pending.config, null);
assert.deepEqual(pending.events, []);
assert.equal(
  await rpc({ p_program_id: "00000000-0000-0000-0000-000000000000" }),
  null,
);
const denied = await fetch(
  `${env.VITE_SUPABASE_URL}/rest/v1/rpc/save_program_agenda`,
  {
    method: "POST",
    headers,
    body: JSON.stringify({
      p_program_id: "8f84c7bf-384c-4756-8b47-bde4306642a3",
      p_config: {},
      p_action: "draft",
    }),
  },
);
assert.equal(denied.status, 401);
const drafts = await fetch(
  `${env.VITE_SUPABASE_URL}/rest/v1/program_agendas?select=program_id`,
  { headers },
);
assert.equal(drafts.status, 401);
console.log(
  "OK: foro público con sesiones, programa inexistente, escritura anónima denegada, borradores privados",
);
