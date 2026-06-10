const BASE_URL = '/api';

async function request(url, options = {}) {
  const res = await fetch(BASE_URL + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export async function listMaps() {
  return request('/maps');
}

export async function parseMap(name) {
  return request(`/maps/${encodeURIComponent(name)}/parse`);
}

export async function sampleRoad(name, roadId) {
  return request(`/maps/${encodeURIComponent(name)}/roads/${encodeURIComponent(roadId)}/sample`);
}

export async function sampleAllRoads(name) {
  return request(`/maps/${encodeURIComponent(name)}/sample-all`);
}

export async function uploadMap(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(BASE_URL + '/maps/upload', {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}
