export async function startIndividualDownloads(plan, downloadsApi, onProgress = () => {}) {
  let completed = 0;
  let failed = 0;
  for (const item of plan) {
    try {
      await downloadsApi.download({
        url: item.url,
        filename: item.filename,
        conflictAction: 'uniquify',
        saveAs: false
      });
      completed += 1;
    } catch { failed += 1; }
    onProgress({ completed, failed, total: plan.length });
  }
  return { completed, failed };
}

export async function fetchZipEntries(plan, fetcher = fetch, onProgress = () => {}) {
  const files = [];
  let failed = 0;
  for (const [index, item] of plan.entries()) {
    try {
      const response = await fetcher(item.url, { credentials: 'include', cache: 'force-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      files.push({ name: item.filename, data: new Uint8Array(await response.arrayBuffer()) });
    } catch { failed += 1; }
    onProgress({ processed: index + 1, failed, total: plan.length });
  }
  return { files, failed };
}
