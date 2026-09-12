export async function startIndividualDownloads(plan, {
  downloadFile,
  fetcher = fetch,
  urlApi = URL,
  onProgress = () => {}
}) {
  let completed = 0;
  let failed = 0;
  for (const item of plan) {
    let objectUrl;
    try {
      const response = await fetcher(item.url, { credentials: 'include', cache: 'force-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      objectUrl = urlApi.createObjectURL(await response.blob());
      await downloadFile({
        url: objectUrl,
        filename: item.filename
      });
      completed += 1;
    } catch { failed += 1; }
    if (objectUrl) {
      const timer = setTimeout(() => urlApi.revokeObjectURL(objectUrl), 60_000);
      timer.unref?.();
    }
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
