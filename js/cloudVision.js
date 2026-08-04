/**
 * Google Cloud Vision API integration for LAFSys
 * Calls the Vision REST API directly from the browser (no Cloud Function required).
 *
 * SETUP: Replace the placeholder below with your Google Cloud Vision API key.
 * Get one at: https://console.cloud.google.com → APIs & Services → Credentials → Create API Key
 * Then enable the Cloud Vision API: APIs & Services → Library → search "Cloud Vision API" → Enable
 * Restrict the key to your domain: Credentials → edit key → HTTP referrers
 */
const VISION_API_KEY = 'AIzaSyAKl8m89GmmhyS88ushFDQi0r4F6CSXwkg';

const VISION_API_URL = `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`;

class CloudVisionHelper {
    constructor() {
        this.available = VISION_API_KEY !== 'YOUR_VISION_API_KEY' && VISION_API_KEY.length > 0;
        if (!this.available) {
            console.warn('Cloud Vision: API key not configured. Set VISION_API_KEY in cloudVision.js');
        } else {
            console.log('Cloud Vision Helper initialized (direct REST API mode)');
        }
    }

    /**
     * Analyze an image using the Vision REST API.
     * @param {File|Blob|string} imageData - File, Blob, data URL, or Storage URL
     * @returns {Promise<Object>} Vision API response (labelAnnotations, webDetection, etc.)
     */
    async analyzeImage(imageData) {
        if (!this.available) {
            throw new Error('Cloud Vision API key not configured. See cloudVision.js for setup instructions.');
        }

        const imageBase64 = await this._toBase64(imageData);

        const requestBody = {
            requests: [{
                image: { content: imageBase64 },
                features: [
                    { type: 'LABEL_DETECTION',       maxResults: 15 },
                    { type: 'OBJECT_LOCALIZATION',    maxResults: 10 },
                    { type: 'IMAGE_PROPERTIES',       maxResults: 10 },
                    { type: 'SAFE_SEARCH_DETECTION' },
                    { type: 'WEB_DETECTION',          maxResults: 10 },
                    { type: 'TEXT_DETECTION' }
                ]
            }]
        };

        const response = await fetch(VISION_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(`Vision API error ${response.status}: ${(err.error && err.error.message) || response.statusText}`);
        }

        const data = await response.json();

        if (data.responses && data.responses[0] && data.responses[0].error) {
            throw new Error(`Vision API error: ${data.responses[0].error.message}`);
        }

        return data.responses[0] || {};
    }

    /**
     * Analyze an item's image and write Vision labels back to its Firestore document.
     * Safe to call fire-and-forget — all errors are caught and logged.
     * @param {string} itemId - Firestore document ID
     * @param {File|Blob|string} imageData - image File, Blob, or URL
     * @returns {Promise<void>}
     */
    async enrichItem(itemId, imageData) {
        if (!this.available) {
            console.warn('Vision enrichment skipped: API key not configured.');
            return;
        }

        try {
            const result = await this.analyzeImage(imageData);

            const labelAnnotations          = result.labelAnnotations || [];
            const localizedObjectAnnotations = result.localizedObjectAnnotations || [];
            const colors = (result.imagePropertiesAnnotation &&
                            result.imagePropertiesAnnotation.dominantColors &&
                            result.imagePropertiesAnnotation.dominantColors.colors) || [];
            const webEntities = (result.webDetection && result.webDetection.webEntities) || [];
            const textAnnotations = result.textAnnotations || [];

            const visionData = {
                visionLabels: labelAnnotations.map(l => ({
                    description: l.description || '',
                    score: l.score || 0
                })),
                visionObjects: localizedObjectAnnotations.map(o => ({
                    name: o.name || '',
                    score: o.score || 0
                })),
                visionColors: colors.slice(0, 5).map(c => ({
                    red:          (c.color && c.color.red)   || 0,
                    green:        (c.color && c.color.green) || 0,
                    blue:         (c.color && c.color.blue)  || 0,
                    score:        c.score || 0,
                    pixelFraction: c.pixelFraction || 0
                })),
                visionWebEntities: webEntities.slice(0, 10).map(e => ({
                    description: e.description || '',
                    score: e.score || 0
                })),
                visionText: textAnnotations.length > 0 ? (textAnnotations[0].description || '') : '',
                visionAnalyzedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await firebase.firestore().collection('items').doc(itemId).update(visionData);
            console.log(`Vision enrichment complete for ${itemId}: ${labelAnnotations.length} labels`);
        } catch (err) {
            console.warn(`Vision enrichment failed for ${itemId} (non-critical):`, err.message);
        }
    }

    /**
     * Run Vision on multiple images (primary + additional), merge all results into a
     * richer label/entity/color set, and write it to the item's Firestore document.
     * Additional images beyond the primary each contribute new labels and web entities
     * that improve semantic matching accuracy during search.
     * @param {string} itemId
     * @param {Array<File|Blob|string>} imageDataArray - primary first, then additional
     */
    async enrichItemMultipleImages(itemId, imageDataArray) {
        if (!this.available) return;
        if (!imageDataArray || imageDataArray.length === 0) return;

        try {
            // Analyze all images concurrently (Vision API rate limits are generous)
            const analysisPromises = imageDataArray.map(img =>
                this.analyzeImage(img).catch(e => {
                    console.warn('Vision analysis failed for one image:', e.message);
                    return null;
                })
            );
            const results = (await Promise.all(analysisPromises)).filter(Boolean);
            if (results.length === 0) return;

            // Merge labels: keep highest score per unique description
            const labelMap   = new Map();
            const objectMap  = new Map();
            const entityMap  = new Map();
            const allColors  = [];
            let   bestText   = '';

            for (const r of results) {
                for (const l of (r.labelAnnotations || []))
                    labelMap.set(l.description, Math.max(labelMap.get(l.description) || 0, l.score || 0));

                for (const o of (r.localizedObjectAnnotations || []))
                    objectMap.set(o.name, Math.max(objectMap.get(o.name) || 0, o.score || 0));

                for (const e of ((r.webDetection && r.webDetection.webEntities) || []))
                    entityMap.set(e.description, Math.max(entityMap.get(e.description) || 0, e.score || 0));

                const cols = (r.imagePropertiesAnnotation &&
                              r.imagePropertiesAnnotation.dominantColors &&
                              r.imagePropertiesAnnotation.dominantColors.colors) || [];
                allColors.push(...cols);

                const txt = (r.textAnnotations && r.textAnnotations[0] && r.textAnnotations[0].description) || '';
                if (txt.length > bestText.length) bestText = txt;
            }

            const sortByScore = (map, limit) =>
                [...map.entries()]
                    .filter(([k]) => k)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, limit)
                    .map(([description, score]) => ({ description, score }));

            const visionData = {
                visionLabels:      sortByScore(labelMap, 20),
                visionObjects:     [...objectMap.entries()].filter(([k])=>k).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([name,score])=>({name,score})),
                visionWebEntities: sortByScore(entityMap, 15),
                visionColors: allColors
                    .sort((a, b) => (b.score || 0) - (a.score || 0))
                    .slice(0, 6)
                    .map(c => ({
                        red:  (c.color && c.color.red)   || 0,
                        green:(c.color && c.color.green) || 0,
                        blue: (c.color && c.color.blue)  || 0,
                        score: c.score || 0,
                        pixelFraction: c.pixelFraction || 0
                    })),
                visionText: bestText,
                visionAnalyzedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await firebase.firestore().collection('items').doc(itemId).update(visionData);
            console.log(`Multi-image Vision enrichment complete for ${itemId}: ${visionData.visionLabels.length} labels from ${results.length} images`);
        } catch (err) {
            console.warn(`Multi-image Vision enrichment failed for ${itemId}:`, err.message);
        }
    }

    /**
     * Convert any supported image format to a raw base64 string (no data: prefix).
     * Compresses Blobs/Files to ≤1200px and JPEG quality 0.85 before encoding
     * so the payload stays well under the Vision API's ~10 MB limit.
     * @private
     */
    async _toBase64(imageData) {
        if (imageData instanceof Blob) {
            const compressed = await this._compressImage(imageData);
            return this._blobToBase64(compressed);
        }
        if (typeof imageData === 'string') {
            if (imageData.startsWith('data:')) {
                return imageData.split(',')[1];
            }
            // Storage URL or any HTTP URL — fetch first
            const res = await fetch(imageData);
            const blob = await res.blob();
            const compressed = await this._compressImage(blob);
            return this._blobToBase64(compressed);
        }
        throw new Error('Unsupported image format for Vision API');
    }

    /**
     * Resize image to fit within MAX_PX on the longest edge, output as JPEG.
     * Falls back to original blob if canvas is unavailable.
     * @private
     */
    _compressImage(blob) {
        const MAX_PX = 1200;
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(blob);
            img.onload = () => {
                URL.revokeObjectURL(url);
                let w = img.naturalWidth, h = img.naturalHeight;
                if (w <= MAX_PX && h <= MAX_PX) {
                    // Already small enough — just re-encode as JPEG to normalise format
                    const c = document.createElement('canvas');
                    c.width = w; c.height = h;
                    c.getContext('2d').drawImage(img, 0, 0);
                    c.toBlob(b => resolve(b || blob), 'image/jpeg', 0.85);
                } else {
                    const ratio = Math.min(MAX_PX / w, MAX_PX / h);
                    w = Math.round(w * ratio);
                    h = Math.round(h * ratio);
                    const c = document.createElement('canvas');
                    c.width = w; c.height = h;
                    c.getContext('2d').drawImage(img, 0, 0, w, h);
                    c.toBlob(b => resolve(b || blob), 'image/jpeg', 0.85);
                }
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(blob); };
            img.src = url;
        });
    }

    /**
     * Read a Blob/File as base64 using FileReader.
     * @private
     */
    _blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result.split(',')[1]);
            reader.onerror = () => reject(new Error('Failed to convert image to base64'));
            reader.readAsDataURL(blob);
        });
    }
}

const cloudVision = new CloudVisionHelper();
window.CloudVision = cloudVision;
