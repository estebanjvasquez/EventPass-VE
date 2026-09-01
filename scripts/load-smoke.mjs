const targets = JSON.parse(process.env.EVENTPASS_LOAD_TARGETS ?? "[]");
const stages = [
  { concurrency: 5, requests: 50 },
  { concurrency: 10, requests: 100 },
  { concurrency: 20, requests: 200 },
];

if (!targets.length) throw new Error("Define EVENTPASS_LOAD_TARGETS con al menos un destino.");

const percentile = (values, ratio) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
};

async function runStage(target, stage) {
  const durations = [];
  const statuses = new Map();
  let cursor = 0;
  let transportErrors = 0;
  const started = performance.now();
  async function worker() {
    while (cursor < stage.requests) {
      cursor += 1;
      const requestStarted = performance.now();
      try {
        const response = await fetch(target.url, { headers: target.headers ?? {}, redirect: "follow" });
        await response.arrayBuffer();
        durations.push(performance.now() - requestStarted);
        statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
      } catch {
        transportErrors += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: stage.concurrency }, () => worker()));
  const elapsedMs = performance.now() - started;
  const httpErrors = [...statuses].filter(([status]) => status >= 400).reduce((sum, [, count]) => sum + count, 0);
  return {
    target: target.name,
    concurrency: stage.concurrency,
    requests: stage.requests,
    requestsPerSecond: Number((stage.requests / (elapsedMs / 1000)).toFixed(1)),
    p50Ms: Math.round(percentile(durations, 0.5)),
    p95Ms: Math.round(percentile(durations, 0.95)),
    p99Ms: Math.round(percentile(durations, 0.99)),
    httpErrors,
    transportErrors,
    statuses: Object.fromEntries(statuses),
  };
}

const results = [];
for (const stage of stages) {
  for (const target of targets) results.push(await runStage(target, stage));
}
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), stages, results }, null, 2));
