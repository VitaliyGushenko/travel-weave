/** Обратный геокодинг координат → человекочитаемое место (BigDataCloud, без ключа). */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const fallback = `Точка ${lat.toFixed(1)}, ${lng.toFixed(1)}`;
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=ru`,
    );
    if (!res.ok) {
      return fallback;
    }
    const data = (await res.json()) as {
      city?: string;
      locality?: string;
      principalSubdivision?: string;
    };
    const place = data.city || data.locality || data.principalSubdivision;
    return place ? place : fallback;
  } catch {
    return fallback;
  }
}
