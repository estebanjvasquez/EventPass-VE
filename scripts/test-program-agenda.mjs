import assert from "node:assert/strict";
import {
  agendaDays,
  agendaWallTime,
  agendaInstant,
} from "../frontend/src/lib/programAgenda.ts";
assert.deepEqual(
  agendaDays("2026-10-15T13:00:00Z", "2026-10-17T21:00:00Z", "America/Caracas"),
  ["2026-10-15", "2026-10-16", "2026-10-17"],
);
assert.deepEqual(agendaDays("", "", "America/Caracas"), []);
assert.equal(
  agendaWallTime("2026-10-15T13:00:00Z", "America/Caracas"),
  "2026-10-15T09:00",
);
assert.equal(
  agendaInstant("2026-10-15T09:00", "America/Caracas"),
  "2026-10-15T13:00:00.000Z",
);
assert.equal(
  agendaInstant("2026-10-15T09:00", "Europe/Madrid"),
  "2026-10-15T07:00:00.000Z",
);
assert.throws(() => agendaInstant("2026-03-29T02:30", "Europe/Madrid"));
console.log(
  "OK: rango multidía, conversión de zona horaria y hora inexistente por DST",
);
