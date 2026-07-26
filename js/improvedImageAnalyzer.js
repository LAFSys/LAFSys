/**
 * Improved Image Analyzer for more accurate image matching
 * This version focuses on detecting shapes, textures, and object features
 * beyond just color analysis
 */

// Shared across both label-to-title and label-to-label matching.
// Vision API uses generic category names; these map them to the specific words
// that appear in item titles AND in other Vision API responses.
const VISION_LABEL_SYNONYMS = {
  'writing implement': ['pen', 'pencil', 'marker', 'crayon', 'highlighter', 'ballpoint', 'ballpen', 'felt tip'],
  'office supplies':   ['pen', 'pencil', 'stapler', 'scissors', 'calculator', 'ruler', 'eraser', 'tape'],
  'stationery':        ['pen', 'pencil', 'notebook', 'pad', 'paper', 'envelope'],
  'mobile phone':      ['phone', 'smartphone', 'cellphone', 'mobile', 'iphone', 'android'],
  'smartphone':        ['phone', 'cellphone', 'mobile', 'iphone', 'android'],
  'personal computer': ['laptop', 'computer', 'notebook', 'desktop', 'pc'],
  'laptop':            ['laptop', 'notebook', 'computer', 'chromebook', 'macbook'],
  'handbag':           ['bag', 'purse', 'tote', 'satchel'],
  'fashion accessory': ['bag', 'purse', 'wallet', 'watch', 'belt', 'bracelet'],
  'footwear':          ['shoe', 'shoes', 'sneaker', 'boot', 'sandal', 'slipper'],
  'outerwear':         ['jacket', 'coat', 'hoodie', 'parka', 'vest', 'cardigan'],
  'coin purse':        ['wallet', 'pouch', 'purse'],
  'eyewear':           ['glasses', 'spectacles', 'sunglasses', 'goggles'],
  'headphones':        ['headphones', 'earphones', 'earbuds', 'headset', 'earpiece'],
  'wristwatch':        ['watch', 'timepiece'],
  'backpack':          ['backpack', 'bag', 'knapsack', 'rucksack'],
  'book':              ['book', 'notebook', 'journal', 'diary', 'planner'],
  'umbrella':          ['umbrella', 'parasol'],
  'musical instrument':['guitar', 'violin', 'piano', 'keyboard', 'drum', 'ukulele'],
  'cosmetics':         ['makeup', 'lipstick', 'foundation', 'blush', 'eyeliner', 'concealer'],
  'luggage':           ['luggage', 'suitcase', 'bag', 'trolley'],
};

// Build a reverse lookup: specific word → generic labels that cover it
const VISION_LABEL_REVERSE = {};
for (const [generic, specifics] of Object.entries(VISION_LABEL_SYNONYMS)) {
  for (const s of specifics) {
    if (!VISION_LABEL_REVERSE[s]) VISION_LABEL_REVERSE[s] = [];
    VISION_LABEL_REVERSE[s].push(generic);
  }
}

class ImprovedImageAnalyzer {
  constructor() {
    console.log('Improved Image Analyzer initialized');
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    
    // Initialize pre-trained models
    this.initializeModels();
    
    // Category keywords for better matching
    this.categoryKeywords = {
      'electronics': ['phone', 'smartphone', 'iphone', 'android', 'laptop', 'computer', 'tablet', 'ipad', 'earbuds', 'headphones', 'smart watch', 'camera', 'charger', 'cable', 'powerbank', 'speaker'],
      'accessories': ['wallet', 'purse', 'bag', 'backpack', 'jewelry', 'necklace', 'ring', 'bracelet', 'watch', 'analog watch', 'wristwatch', 'sunglasses', 'glasses', 'hat', 'cap', 'umbrella', 'keychain', 'belt'],
      'clothing': ['jacket', 'shirt', 'pants', 'jeans', 'dress', 'skirt', 'sweater', 'hoodie', 'coat', 'socks', 'shoes', 'boots', 'sneakers', 'footwear', 'shoe'],
      'stationery': ['pen', 'pencil', 'marker', 'ballpen', 'ballpoint', 'writing instrument', 'highlighter', 'notebook', 'eraser', 'ruler', 'scissors', 'stapler', 'tape', 'glue'],
      'documents': ['id', 'card', 'passport', 'book', 'paper', 'document', 'folder', 'file', 'license'],
      'personal': ['keys', 'key', 'bottle', 'water bottle', 'medicine', 'cosmetics', 'makeup', 'toy', 'fan', 'lunchbox']
    };

    // Labels that indicate scene/background or are non-object descriptors
    this.backgroundLabels = new Set([
      // Scene / environment
      'pattern','textile','linens','linen','fabric','cloth','tablecloth','bedding',
      'furniture','table','desk','floor','flooring','wood','concrete','surface',
      'background','wall','ceiling','tile','carpet','rug','mat','nature','sky',
      'grass','ground','soil','road','pavement','room','indoor','outdoor',
      'interior','exterior','still life','photography','shadow','light','lighting',
      'stripe','stripes','plaid','diagonal','line','lines','monochrome',
      // Person / body parts — the person holding or standing near the item is not the item
      'person','human','people','man','woman','boy','girl','adult','child',
      'hand','finger','fingers','arm','leg','foot','face','head','hair','skin',
      'body','human body','limb',
      // Pure color words — color matching is handled by histogram, not labels
      'pink','red','blue','green','yellow','orange','purple','violet',
      'brown','beige','white','black','gray','grey','silver','gold',
      'cyan','magenta','teal','maroon','navy','turquoise','crimson',
      'ivory','lavender','peach','coral','mint','rose','scarlet',
      // Abstract descriptors
      'paint','color','colour','hue','shade','tone','tint','dye',
      // Broad umbrella category labels — these are shared across too many different item types
      // (a laptop AND a pen are both "office supplies") and cause false cross-type matches.
      // Specific object labels ("laptop", "pen") do the real work; these add noise.
      'office supplies','office equipment','office','multimedia','technology',
      'consumer electronics','electronic','electronics','equipment','computing',
      'gadget','hardware','appliance','instrument','tool','device','machine',
      'supplies','goods','product','material','object','item',
      // Visual/layout descriptors — Vision returns these for almost any clear photo
      'rectangle','font','logo','sign','photograph','snapshot','image',
      'illustration','graphic','macro photography','close up','close-up',
      'number','digit','symbol','icon'
    ]);
  }

  /**
   * Initialize pre-trained models for image analysis
   */
  async initializeModels() {
    try {
      // We'll use browser APIs directly since we don't have external models
      console.log('Using browser capabilities for image analysis');
      this.modelsReady = true;
    } catch (error) {
      console.error('Error initializing models:', error);
      this.modelsReady = false;
    }
  }

  /**
   * Analyze an image for better accuracy
   * @param {Blob|File|String} imageData - Image to analyze
   * @returns {Promise} Analysis results
   */
  async analyzeImage(imageData) {
    try {
      console.log('Analyzing image with improved analyzer');
      
      // Load image
      const img = await this._loadImage(imageData);
      
      // Canvas setup for analysis
      const size = Math.max(img.width, img.height);
      this.canvas.width = size;
      this.canvas.height = size;
      this.ctx.drawImage(img, 0, 0, img.width, img.height);
      
      // CRITICAL: Create the comparison fingerprint using the SAME path as item images
      // This ensures identical images produce identical fingerprints
      const uploadedFeatures = await this._getItemImageFeatures_fromImg(img);

      // Compute rotated fingerprints so a physically rotated photo of the same item
      // still scores as a near-exact match. dHash encodes horizontal differences, so
      // a 90° rotation changes the hash structure — we must re-draw then re-hash.
      const rot90Fingerprint  = await this._computeRotatedFingerprint(img,  90);
      const rot270Fingerprint = await this._computeRotatedFingerprint(img, 270);

      // Extract features for label/color/shape analysis
      const features = await this._extractFeatures(img);

      // Return analysis results
      return {
        labelAnnotations: features.labels.map((label, i) => ({
          description: label,
          score: features.labelScores[i] || 0.8
        })),
        imagePropertiesAnnotation: {
          dominantColors: {
            colors: features.colors.map((color, i) => ({
              color: {
                red: color.r,
                green: color.g,
                blue: color.b
              },
              score: features.colorScores[i] || 0.8,
              pixelFraction: 0.1
            }))
          }
        },
        objectFeatures: features.objectFeatures,
        textAnnotations: features.textAnnotations,
        shapeFeatures: features.shapeFeatures,
        imageFingerprint: uploadedFeatures.fingerprint,
        _colorHistogram: uploadedFeatures.colorHistogram,
        _pixelData: uploadedFeatures.pixelData,
        _rot90Fingerprint:  rot90Fingerprint,
        _rot270Fingerprint: rot270Fingerprint
      };
    } catch (error) {
      console.error('Error in improved image analysis:', error);
      throw new Error('Failed to analyze image: ' + error.message);
    }
  }

  /**
   * Find similar items based on improved analysis
   * @param {Object} analysisResults - Results from analyzeImage
   * @returns {Promise<Array>} - Matching items
   */
  async findSimilarItems(analysisResults, userCategory = null) {
    try {
      console.log('Finding similar items with improved method');

      // Get only active items — claimed, returned, and disposed items should not appear in search results
      const querySnapshot = await firebase.firestore().collection('items')
        .where('status', '==', 'active')
        .get();
      let allItems = [];
      querySnapshot.forEach(doc => {
        allItems.push({
          id: doc.id,
          ...doc.data()
        });
      });

      if (allItems.length === 0) {
        return [];
      }

      // Hard category filter — eliminates the biggest class of false positives at zero API cost
      if (userCategory) {
        const before = allItems.length;
        allItems = allItems.filter(item =>
          !item.category || item.category.toLowerCase() === userCategory.toLowerCase()
        );
        console.log(`Category filter "${userCategory}": ${before} → ${allItems.length} items`);
      }
      
      // Extract features from analysis results
      const labels = (analysisResults.labelAnnotations || []).map(l => l.description.toLowerCase());
      const colors = (analysisResults.imagePropertiesAnnotation?.dominantColors?.colors || []).map(c => c.color);
      const objectFeatures = analysisResults.objectFeatures || {};
      const shapeFeatures = analysisResults.shapeFeatures || {};
      const uploadedFingerprint     = analysisResults.imageFingerprint || [];
      const uploadedColorHist       = analysisResults._colorHistogram || this._lastColorHistogram || [];
      // Full-image (pre-bbox-crop) variants preserved for exact-match detection.
      // Stored items always use full-image features, so comparing only the cropped
      // fingerprint would score the exact same photo poorly.
      const fullImageFingerprint    = analysisResults._fullImageFingerprint || uploadedFingerprint;
      const fullColorHist           = analysisResults._fullColorHistogram   || uploadedColorHist;
      const fullPixelData           = analysisResults._fullPixelData        || null;
      // Rotation fingerprints — computed once at upload time, used for every item comparison
      const rot90Fingerprint        = analysisResults._rot90Fingerprint     || null;
      const rot270Fingerprint       = analysisResults._rot270Fingerprint    || null;

      // Keep annotated labels for semantic Vision matching — filter background labels
      const queryVisionLabels = (analysisResults.labelAnnotations || [])
        .filter(l => !this.backgroundLabels.has(l.description.toLowerCase()))
        .map(l => ({ description: l.description, score: l.score || 0.5 }));

      // Extract OCR tokens from the query image (highest-weight signal — brand names, serial numbers)
      const queryOcrTokens = [];
      const rawOcrText = (analysisResults.textAnnotations && analysisResults.textAnnotations[0])
        ? (analysisResults.textAnnotations[0].description || '')
        : '';
      if (rawOcrText) {
        const seen = new Set();
        for (const t of rawOcrText.toLowerCase().split(/[\s\W]+/)) {
          if (t.length > 2 && !this.backgroundLabels.has(t) && !seen.has(t)) {
            queryOcrTokens.push({ token: t, conf: 1.0 });
            seen.add(t);
          }
        }
        if (queryOcrTokens.length > 0)
          console.log('Query OCR tokens:', queryOcrTokens.map(t => t.token).join(', '));
      }

      // Infer probable category from Vision labels before the item loop
      const inferredCategory = this._inferCategoryFromLabels(queryVisionLabels);
      if (inferredCategory) console.log('Inferred query category:', inferredCategory);
      
      // Compare uploaded image directly against each item's image
      const scoredItems = [];
      const uploadedPixelData = analysisResults._pixelData || null; // cropped (used as fallback)
      
      for (const item of allItems) {
        // Pre-filter: skip items whose category is clearly incompatible with the query
        if (!this._categoriesAreCompatible(inferredCategory, item.category)) {
          console.log(`Skipping "${item.title}" — category mismatch (${item.category})`);
          continue;
        }

        let hashScore = 0;
        let colorCompareScore = 0;
        let pixelScore = 0;

        // Direct image comparison if item has an image
        if (item.image) {
          try {
            const itemFeatures = await this._getItemImageFeatures(item.image);

            // Compare ALL available fingerprints (normal, full-image, 90°, 270°) and take
            // the highest score. This makes physically rotated photos of the same item score
            // as near-exact matches. Stored items always use full-image features, so we
            // include the full-image fingerprint to avoid penalising identical uploads.
            const candidates = [uploadedFingerprint, fullImageFingerprint, rot90Fingerprint, rot270Fingerprint]
              .filter(Boolean)
              .map(fp => this._compareFingerprints(fp, itemFeatures.fingerprint));
            hashScore = Math.max(...candidates);

            const croppedColor = this._compareColorHistograms(uploadedColorHist, itemFeatures.colorHistogram);
            const fullColor    = this._compareColorHistograms(fullColorHist,     itemFeatures.colorHistogram);
            colorCompareScore  = Math.max(croppedColor, fullColor);

            // Pixel comparison — try full-image data first (higher precision for exact match)
            const pixelSrc = fullPixelData || uploadedPixelData;
            if (pixelSrc && itemFeatures.pixelData) {
              pixelScore = this._comparePixels(pixelSrc, itemFeatures.pixelData);
            }
          } catch (e) {
            console.log('Could not compare image for item:', item.title, e.message);
          }
        }

        // Use the BEST visual score between hash and pixel comparison
        const visualScore = Math.max(hashScore, pixelScore);
        
        // Text-based scores
        const titleScore = this._calculateTitleScore(item, labels);
        const categoryScore = this._calculateCategoryScore(item, labels);
        const descriptionScore = this._calculateDescriptionScore(item, labels);
        
        // Vision label semantic score (only when item has been enriched with Vision data)
        const hasStoredVision = item.visionLabels && item.visionLabels.length > 0;
        let visionLabelScore = 0;
        if (hasStoredVision) {
          visionLabelScore = this._calculateVisionLabelMatchScore(
            queryVisionLabels,
            item.visionLabels,
            item.visionObjects || [],
            item.visionWebEntities || [],
            queryOcrTokens,
            item.visionText || ''
          );
        }

        // Vision-label → item-title score (works even when item has no stored Vision data)
        const labelTitleScore = this._calculateLabelTitleScore(item, queryVisionLabels);

        let weightedScore;
        if (visualScore > 0.85) {
          // Near-exact visual match — same or near-identical image.
          // dHash (inside visualScore) is used instead of raw pixelScore because
          // Firebase Storage compresses images to JPEG, creating pixel-level differences
          // that prevent pixelScore from reaching 0.9 even for the exact same upload.
          weightedScore = 0.92 + (visualScore - 0.85) * 0.53;
        } else if (hasStoredVision) {
          // When stored Vision labels exist, use label-to-label Jaccard similarity as one
          // semantic signal, but also keep labelTitleScore (which has synonym expansion)
          // as a fallback for vocabulary mismatches ("writing implement" vs "pen" title).
          const semanticScore = Math.max(visionLabelScore, labelTitleScore);
          // Color weight is kept very low — a laptop with a red wallpaper has the same
          // color histogram as a red pen, so color alone must not drive relevance.
          weightedScore = (
            semanticScore     * 0.65 +
            colorCompareScore * 0.10 +
            visualScore       * 0.20 +
            categoryScore     * 0.05
          );
          // Semantic gate: if we can identify the query object type but this item has no
          // meaningful label overlap at all, suppress it below the filtering threshold so
          // color similarity alone cannot surface unrelated items.
          if (inferredCategory && semanticScore < 0.20) {
            weightedScore = Math.min(weightedScore, 0.30);
          }
        } else {
          // Semantic label→title match is the primary gate (0–60%).
          // Visual similarity refines within that gate. Color is a weak tiebreaker only —
          // it is far too unreliable on its own (a red-screen laptop matches a red pen).
          const visualBonus =
            visualScore       * 0.60 +
            colorCompareScore * 0.20 +
            descriptionScore  * 0.20;
          weightedScore = labelTitleScore * 0.60 + visualBonus * 0.40;
          // Same semantic gate for the no-Vision fallback path
          if (inferredCategory && labelTitleScore < 0.20) {
            weightedScore = Math.min(weightedScore, 0.30);
          }
        }

        const diagnostics = {
          hashScore,
          pixelScore,
          visualScore,
          colorCompareScore,
          visionLabelScore,
          labelTitleScore,
          titleScore,
          categoryScore,
          descriptionScore
        };

        console.log(`Item "${item.title}": labelTitle=${(labelTitleScore*100).toFixed(1)}% vision=${(visionLabelScore*100).toFixed(1)}% pixel=${(pixelScore*100).toFixed(1)}% color=${(colorCompareScore*100).toFixed(1)}% total=${(weightedScore*100).toFixed(1)}%`);
        
        scoredItems.push({
          ...item,
          score: Math.min(0.99, weightedScore),
          diagnostics
        });
      }
      
      // Sort by score (highest first)
      scoredItems.sort((a, b) => b.score - a.score);

      // Filter out low-confidence results — when we know the object type (inferredCategory),
      // apply a stricter threshold so unrelated items don't pollute results.
      const minThreshold = inferredCategory ? 0.45 : 0.25;
      const meaningful = scoredItems.filter(item => item.score >= minThreshold);

      if (meaningful.length > 0) return meaningful.slice(0, 5);

      // No items cleared the threshold.
      // When no category was inferred (no Vision data), return top 3 as a best-effort guess.
      // When a category WAS inferred, do NOT fall back — showing a bag, laptop, or shoe for
      // a pen search is more confusing than showing "no results found".
      if (!inferredCategory) return scoredItems.slice(0, 3);
      return [];
    } catch (error) {
      console.error('Error finding similar items:', error);
      throw new Error('Failed to find similar items');
    }
  }
  
  /**
   * Get image features from a loaded Image element (used for uploaded image)
   * @private
   */
  async _getItemImageFeatures_fromImg(img) {
    const compareCanvas = document.createElement('canvas');
    const compareCtx = compareCanvas.getContext('2d');
    compareCanvas.width = 64;
    compareCanvas.height = 64;
    compareCtx.drawImage(img, 0, 0, 64, 64);
    const smallData = compareCtx.getImageData(0, 0, 64, 64);
    
    const fingerprint = this._createDHash(smallData);
    const colorHistogram = this._createColorHistogram(smallData.data);
    const pixelData = this._extractPixelSignature(smallData.data);
    
    return { fingerprint, colorHistogram, pixelData };
  }

  /**
   * Re-compute fingerprint, color histogram, and dominant colors from a
   * normalized bounding box crop — used to strip background influence.
   * bbox: { x1, y1, x2, y2 } all in [0,1]
   */
  async recomputeFeaturesFromBBox(imageData, bbox) {
    try {
      const img = await this._loadImage(imageData);
      const iw = img.naturalWidth  || img.width;
      const ih = img.naturalHeight || img.height;

      // Pixel coordinates of the crop
      const cropX = Math.max(0, Math.floor(bbox.x1 * iw));
      const cropY = Math.max(0, Math.floor(bbox.y1 * ih));
      const cropW = Math.min(iw - cropX, Math.ceil((bbox.x2 - bbox.x1) * iw));
      const cropH = Math.min(ih - cropY, Math.ceil((bbox.y2 - bbox.y1) * ih));

      if (cropW < 4 || cropH < 4) return null;

      // Draw cropped region scaled to 64×64 for fingerprint
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, 64, 64);
      const smallData = ctx.getImageData(0, 0, 64, 64);

      const fingerprint    = this._createDHash(smallData);
      const colorHistogram = this._createColorHistogram(smallData.data);

      // Extract dominant colors from the cropped pixel data
      const colorCounts = new Map();
      const px = smallData.data;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 128) continue;
        const qr = Math.floor(px[i]     / 24) * 24;
        const qg = Math.floor(px[i + 1] / 24) * 24;
        const qb = Math.floor(px[i + 2] / 24) * 24;
        const key = `${qr},${qg},${qb}`;
        colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
      }
      const totalSamples = [...colorCounts.values()].reduce((a, b) => a + b, 0) || 1;
      const dominantColors = [...colorCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([key, count]) => {
          const [r, g, b] = key.split(',').map(Number);
          return {
            color: { red: r, green: g, blue: b },
            score: count / totalSamples,
            pixelFraction: count / totalSamples
          };
        });

      return { fingerprint, colorHistogram, dominantColors };
    } catch (e) {
      console.warn('recomputeFeaturesFromBBox failed:', e.message);
      return null;
    }
  }

  /**
   * Get image features for a stored item image (with caching)
   * @private
   */
  async _getItemImageFeatures(imageSource) {
    // Check cache
    const cacheKey = typeof imageSource === 'string' ? imageSource.substring(0, 100) : 'blob';
    if (this._imageFeatureCache && this._imageFeatureCache.has(cacheKey)) {
      return this._imageFeatureCache.get(cacheKey);
    }
    if (!this._imageFeatureCache) this._imageFeatureCache = new Map();

    // For Firebase Storage / external HTTP URLs, fetch as blob first so the canvas
    // is never tainted (blob: URLs are treated as same-origin by the canvas API)
    let imageToLoad = imageSource;
    if (typeof imageSource === 'string' && imageSource.startsWith('http')) {
      try {
        const res = await fetch(imageSource);
        if (res.ok) {
          const blob = await res.blob();
          imageToLoad = URL.createObjectURL(blob);
        }
      } catch (fetchErr) {
        console.log('Could not fetch image for pixel comparison:', fetchErr.message);
        // Fall through to direct load (canvas may be tainted, handled below)
      }
    }

    const img = await this._loadImage(imageToLoad);

    const compareCanvas = document.createElement('canvas');
    const compareCtx = compareCanvas.getContext('2d');
    compareCanvas.width = 64;
    compareCanvas.height = 64;
    compareCtx.drawImage(img, 0, 0, 64, 64);

    let smallData;
    try {
      smallData = compareCtx.getImageData(0, 0, 64, 64);
    } catch (e) {
      // Canvas tainted by cross-origin image — pixel comparison unavailable for this item
      console.log('Canvas tainted for', cacheKey.substring(0, 60), '— pixel comparison skipped');
      const features = { fingerprint: [], colorHistogram: [], pixelData: null };
      this._imageFeatureCache.set(cacheKey, features);
      return features;
    }

    const fingerprint = this._createDHash(smallData);
    const colorHistogram = this._createColorHistogram(smallData.data);
    const pixelData = this._extractPixelSignature(smallData.data);

    const features = { fingerprint, colorHistogram, pixelData };
    this._imageFeatureCache.set(cacheKey, features);
    return features;
  }
  
  /**
   * Extract a compact pixel signature for direct comparison
   * Samples pixels in a center-weighted grid
   * @private
   */
  _extractPixelSignature(pixels) {
    // Extract grayscale values at every 4th pixel for a 64x64 image
    // Focus more on the center (where the object usually is)
    const signature = [];
    const size = 64;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        // Weighted grayscale
        const gray = pixels[idx] * 0.299 + pixels[idx+1] * 0.587 + pixels[idx+2] * 0.114;
        signature.push(gray);
      }
    }
    
    return signature;
  }
  
  /**
   * Compare two pixel signatures using normalized cross-correlation
   * This is excellent at detecting identical or near-identical images
   * @private
   */
  _comparePixels(sig1, sig2) {
    if (!sig1 || !sig2 || sig1.length === 0 || sig2.length === 0) return 0;
    
    const len = Math.min(sig1.length, sig2.length);
    const size = 64;
    
    // Calculate means
    let mean1 = 0, mean2 = 0;
    for (let i = 0; i < len; i++) {
      mean1 += sig1[i];
      mean2 += sig2[i];
    }
    mean1 /= len;
    mean2 /= len;
    
    // Calculate normalized cross-correlation with center weighting
    let sumCross = 0, sumSq1 = 0, sumSq2 = 0;
    const centerX = size / 2, centerY = size / 2;
    const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
    
    for (let i = 0; i < len; i++) {
      const x = i % size;
      const y = Math.floor(i / size);
      
      // Center weight: pixels near center matter more
      const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      const weight = 1.0 + (1.0 - dist / maxDist); // 1.0 at edge, 2.0 at center
      
      const d1 = (sig1[i] - mean1) * weight;
      const d2 = (sig2[i] - mean2) * weight;
      
      sumCross += d1 * d2;
      sumSq1 += d1 * d1;
      sumSq2 += d2 * d2;
    }
    
    const denom = Math.sqrt(sumSq1 * sumSq2);
    if (denom === 0) return 0;
    
    // NCC ranges from -1 to 1; we map it to 0-1
    const ncc = sumCross / denom;
    const score = (ncc + 1) / 2; // Map [-1,1] to [0,1]
    
    // Apply curve: identical images (score > 0.95) get very high results
    if (score > 0.98) return 0.98 + (score - 0.98) * 0.5;
    if (score > 0.90) return 0.85 + (score - 0.90) * 1.625;
    if (score > 0.80) return 0.60 + (score - 0.80) * 2.5;
    if (score > 0.65) return 0.30 + (score - 0.65) * 2.0;
    return score * 0.46;
  }
  
  /**
   * Create a difference hash (dHash) with 17x16 = 256 bit resolution
   * Higher resolution = better discrimination between different images
   * @private
   */
  _createDHash(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const pixels = imageData.data;
    const hash = [];
    
    // Use a 17x16 grid for 256-bit hash (much more discriminating than 72-bit)
    const gridW = 17;
    const gridH = 16;
    const gray = [];
    
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        // Sample with area averaging for more stable results
        const px = Math.floor(x * width / gridW);
        const py = Math.floor(y * height / gridH);
        const px2 = Math.min(width - 1, Math.floor((x + 1) * width / gridW));
        const py2 = Math.min(height - 1, Math.floor((y + 1) * height / gridH));
        
        let sum = 0, count = 0;
        for (let sy = py; sy <= py2; sy++) {
          for (let sx = px; sx <= px2; sx++) {
            const idx = (sy * width + sx) * 4;
            sum += pixels[idx] * 0.299 + pixels[idx+1] * 0.587 + pixels[idx+2] * 0.114;
            count++;
          }
        }
        gray.push(count > 0 ? sum / count : 0);
      }
    }
    
    // Compare adjacent pixels horizontally
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW - 1; x++) {
        const idx = y * gridW + x;
        hash.push(gray[idx] > gray[idx + 1] ? 1 : 0);
      }
    }
    
    return hash;
  }
  
  /**
   * Create a color histogram in HSL space with center weighting
   * HSL is better than RGB for perceptual color matching
   * Center weighting reduces background influence
   * @private
   */
  _createColorHistogram(pixels) {
    // 12 hue bins x 4 saturation bins x 4 lightness bins = 192 bins
    const hBins = 12, sBins = 4, lBins = 4;
    const totalBins = hBins * sBins * lBins;
    const histogram = new Array(totalBins).fill(0);
    let totalWeight = 0;
    const size = 64; // Assuming 64x64 image
    const centerX = size / 2, centerY = size / 2;
    const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
    
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i+3] < 128) continue; // skip transparent
      
      // Center weighting
      const pixIdx = i / 4;
      const x = pixIdx % size;
      const y = Math.floor(pixIdx / size);
      const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      const weight = 1.0 + 2.0 * (1.0 - dist / maxDist); // 1 at edge, 3 at center
      
      // Convert RGB to HSL
      const r = pixels[i] / 255, g = pixels[i+1] / 255, b = pixels[i+2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const l = (max + min) / 2;
      let h = 0, s = 0;
      
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
      }
      
      const hBin = Math.min(hBins - 1, Math.floor(h * hBins));
      const sBin = Math.min(sBins - 1, Math.floor(s * sBins));
      const lBin = Math.min(lBins - 1, Math.floor(l * lBins));
      
      histogram[hBin * sBins * lBins + sBin * lBins + lBin] += weight;
      totalWeight += weight;
    }
    
    // Normalize
    if (totalWeight > 0) {
      for (let i = 0; i < histogram.length; i++) {
        histogram[i] /= totalWeight;
      }
    }
    
    return histogram;
  }
  
  /**
   * Draw the source image rotated by `degrees` (90 or 270) on a fresh canvas,
   * scale it to 64×64, then return the dHash fingerprint.
   * This is the only reliable way to make dHash rotation-invariant — dHash encodes
   * horizontal brightness gradients, so rearranging the bit array doesn't work.
   * @private
   */
  async _computeRotatedFingerprint(img, degrees) {
    try {
      const iw = img.naturalWidth  || img.width;
      const ih = img.naturalHeight || img.height;
      // For 90/270° the axes swap; canvas size reflects the rotated dimensions
      const cw = (degrees === 90 || degrees === 270) ? ih : iw;
      const ch = (degrees === 90 || degrees === 270) ? iw : ih;

      const rotCanvas = document.createElement('canvas');
      rotCanvas.width = cw; rotCanvas.height = ch;
      const rotCtx = rotCanvas.getContext('2d');
      rotCtx.translate(cw / 2, ch / 2);
      rotCtx.rotate((degrees * Math.PI) / 180);
      rotCtx.drawImage(img, -iw / 2, -ih / 2);

      const small = document.createElement('canvas');
      small.width = 64; small.height = 64;
      small.getContext('2d').drawImage(rotCanvas, 0, 0, 64, 64);
      return this._createDHash(small.getContext('2d').getImageData(0, 0, 64, 64));
    } catch (e) {
      return null;
    }
  }

  /**
   * Compare two fingerprints using Hamming distance.
   * Tests all 4 orientations (normal, H-flip, V-flip, 180°) so that rotated or
   * upside-down photos of the same item still score well.
   * @private
   */
  _compareFingerprints(fp1, fp2) {
    if (!fp1 || !fp2 || fp1.length === 0 || fp2.length === 0) return 0;

    const len = Math.min(fp1.length, fp2.length);
    if (len === 0) return 0;

    const hamming = (a, b) => {
      let m = 0;
      for (let i = 0; i < len; i++) if (a[i] === b[i]) m++;
      return m / len;
    };

    // Normal orientation
    let best = hamming(fp1, fp2);

    // Try all orientations when hash has the expected 256-bit (16-row × 16-col) structure.
    // Each orientation is an O(256) array rearrangement — negligible cost.
    if (len === 256) {
      const ROWS = 16, COLS = 16;

      // 180° rotation: reverse row order + reverse within row + invert bits
      const rot180 = new Array(len);
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          rot180[r * COLS + c] = 1 - fp2[(ROWS - 1 - r) * COLS + (COLS - 1 - c)];
      best = Math.max(best, hamming(fp1, rot180));

      // Horizontal flip: reverse within each row + invert bits
      const flipH = new Array(len);
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          flipH[r * COLS + c] = 1 - fp2[r * COLS + (COLS - 1 - c)];
      best = Math.max(best, hamming(fp1, flipH));

      // Vertical flip: reverse row order (bit values unchanged)
      const flipV = new Array(len);
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          flipV[r * COLS + c] = fp2[(ROWS - 1 - r) * COLS + c];
      best = Math.max(best, hamming(fp1, flipV));
    }

    // Map: 50% raw (random) → 0, 100% raw → 1.0
    const adjusted = Math.max(0, (best - 0.50) / 0.50);

    if (adjusted > 0.90) return 0.95 + (adjusted - 0.90) * 0.5;
    if (adjusted > 0.70) return 0.75 + (adjusted - 0.70) * 1.0;
    if (adjusted > 0.40) return 0.35 + (adjusted - 0.40) * 1.33;
    return adjusted * 0.875;
  }
  
  /**
   * Compare two color histograms using Bhattacharyya coefficient
   * More discriminating than simple intersection for HSL histograms
   * @private
   */
  _compareColorHistograms(hist1, hist2) {
    if (!hist1 || !hist2 || hist1.length === 0 || hist2.length === 0) return 0;
    if (hist1.length !== hist2.length) return 0;
    
    // Bhattacharyya coefficient: sum of sqrt(h1[i] * h2[i])
    let bc = 0;
    for (let i = 0; i < hist1.length; i++) {
      bc += Math.sqrt((hist1[i] || 0) * (hist2[i] || 0));
    }
    
    // bc ranges from 0 (no overlap) to 1 (identical)
    // Apply curve to spread scores - identical should be very high
    const score = Math.min(1, bc);
    if (score > 0.95) return 0.95 + (score - 0.95) * 1.0;
    if (score > 0.80) return 0.65 + (score - 0.80) * 2.0;
    if (score > 0.60) return 0.30 + (score - 0.60) * 1.75;
    return score * 0.5;
  }
  
  // PRIVATE METHODS
  
  /**
   * Load image from various formats
   * @private
   */
  _loadImage(source) {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => resolve(img);
      img.onerror = () => {
        // If crossOrigin fetch failed (server doesn't support CORS), retry without it.
        // The canvas will be tainted but the image will at least load for display.
        if (img._crossOriginSet) {
          const fallback = new Image();
          fallback.onload = () => resolve(fallback);
          fallback.onerror = () => reject(new Error('Failed to load image'));
          if (source instanceof Blob || source instanceof File) {
            fallback.src = URL.createObjectURL(source);
          } else {
            fallback.src = source;
          }
        } else {
          reject(new Error('Failed to load image'));
        }
      };

      if (source instanceof Blob || source instanceof File) {
        img.src = URL.createObjectURL(source);
      } else if (typeof source === 'string') {
        // Set crossOrigin for external HTTP(S) URLs so canvas.getImageData() works
        if (source.startsWith('http')) {
          img.crossOrigin = 'anonymous';
          img._crossOriginSet = true;
        }
        img.src = source;
      } else {
        reject(new Error('Unsupported image source'));
      }
    });
  }
  
  /**
   * Extract features from an image
   * @private
   */
  async _extractFeatures(img) {
    // Get image data from canvas
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const pixels = imageData.data;
    
    // 1. Extract colors
    const colors = this._extractColors(pixels);
    const colorScores = colors.map((_, i) => 1 - (i * 0.1));
    
    // 2. Generate labels based on various features
    const baseLabels = this._generateLabelsFromColors(colors);
    
    // 3. Detect shapes
    const shapes = this._detectShapes(imageData);
    
    // 4. Add shape-based labels
    const shapeLabels = this._getLabelsFromShapes(shapes);
    
    // 5. Detect edges for object boundaries
    const edges = this._detectEdges(imageData);
    
    // 6. Extract texture features
    const texture = this._analyzeTexture(imageData);
    const textureLabels = this._getLabelsFromTexture(texture);
    
    // 7. Detect text (simplified)
    const textAnnotations = [];
    
    // 8. Combine all labels, removing duplicates
    const allLabels = [...new Set([...baseLabels, ...shapeLabels, ...textureLabels])];
    const labelScores = allLabels.map((_, i) => Math.max(0.5, 1 - (i * 0.05)));
    
    // 9. Generate object features
    const objectFeatures = {
      hasRectangularShape: shapes.rectangularity > 0.7,
      isRound: shapes.roundness > 0.7,
      isSquare: shapes.squareness > 0.7,
      complexity: shapes.complexity,
      brightness: this._calculateBrightness(pixels),
      contrast: this._calculateContrast(pixels),
      edgeCount: edges.count,
      textureCoarseness: texture.coarseness
    };
    
    // 10. Generate shape features
    const shapeFeatures = {
      aspectRatio: shapes.aspectRatio,
      rectangularity: shapes.rectangularity,
      circularity: shapes.circularity,
      symmetry: shapes.symmetry,
      compactness: shapes.compactness
    };
    
    // 11. Create an image fingerprint (simplified)
    const imageFingerprint = this._createImageFingerprint(imageData);
    
    return {
      labels: allLabels,
      labelScores,
      colors,
      colorScores,
      objectFeatures,
      textAnnotations,
      shapeFeatures,
      imageFingerprint
    };
  }
  
  /**
   * Extract dominant colors from pixels with center-weighting
   * Center pixels are more likely to be the actual object, not background
   * @private
   */
  _extractColors(pixels) {
    const colorCounts = new Map();
    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
    
    // Sample pixels with center weighting
    const step = 4; // Sample every 4th pixel for better accuracy
    for (let i = 0; i < pixels.length; i += step * 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3];
      
      // Skip transparent pixels
      if (a < 128) continue;
      
      // Calculate center weight - center pixels matter 3x more than edge pixels
      const pixIdx = i / 4;
      const x = pixIdx % width;
      const y = Math.floor(pixIdx / width);
      const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      const weight = 1.0 + 2.0 * (1.0 - dist / maxDist); // 1 at edge, 3 at center
      
      // Quantize colors to reduce variants
      const qr = Math.floor(r / 24) * 24;
      const qg = Math.floor(g / 24) * 24;
      const qb = Math.floor(b / 24) * 24;
      
      const colorKey = `${qr},${qg},${qb}`;
      
      colorCounts.set(colorKey, (colorCounts.get(colorKey) || 0) + weight);
    }
    
    // Convert to array and sort by weighted frequency
    const sortedColors = [...colorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(entry => {
        const [r, g, b] = entry[0].split(',').map(Number);
        return { r, g, b };
      });
    
    // Return top 5 colors
    return sortedColors.slice(0, 5);
  }
  
  /**
   * Generate labels from colors
   * Focuses on color descriptions first, then adds broad category hints
   * Specific object guessing is handled by shape and texture analysis
   * @private
   */
  _generateLabelsFromColors(colors) {
    const colorNames = [
      { name: 'red', r: 255, g: 0, b: 0 },
      { name: 'dark red', r: 139, g: 0, b: 0 },
      { name: 'pink', r: 255, g: 192, b: 203 },
      { name: 'orange', r: 255, g: 165, b: 0 },
      { name: 'yellow', r: 255, g: 255, b: 0 },
      { name: 'green', r: 0, g: 128, b: 0 },
      { name: 'light green', r: 144, g: 238, b: 144 },
      { name: 'blue', r: 0, g: 0, b: 255 },
      { name: 'navy', r: 0, g: 0, b: 128 },
      { name: 'light blue', r: 173, g: 216, b: 230 },
      { name: 'purple', r: 128, g: 0, b: 128 },
      { name: 'brown', r: 139, g: 69, b: 19 },
      { name: 'tan', r: 210, g: 180, b: 140 },
      { name: 'black', r: 0, g: 0, b: 0 },
      { name: 'white', r: 255, g: 255, b: 255 },
      { name: 'gray', r: 128, g: 128, b: 128 },
      { name: 'silver', r: 192, g: 192, b: 192 },
      { name: 'beige', r: 245, g: 245, b: 220 }
    ];
    
    // Identify color names for each dominant color
    const identifiedColors = [];
    colors.forEach(color => {
      let minDistance = Infinity;
      let nearestColor = 'unknown';
      
      colorNames.forEach(namedColor => {
        const distance = Math.sqrt(
          (color.r - namedColor.r) ** 2 +
          (color.g - namedColor.g) ** 2 +
          (color.b - namedColor.b) ** 2
        );
        if (distance < minDistance) {
          minDistance = distance;
          nearestColor = namedColor.name;
        }
      });
      
      if (!identifiedColors.includes(nearestColor)) {
        identifiedColors.push(nearestColor);
      }
    });
    
    // Return only the identified color names — no category hints based on color,
    // as those cause false positives (e.g. "black" adding "bag" which matches bags
    // even when searching for a pen).
    return identifiedColors.slice(0, 8);
  }
  
  /**
   * Detect shapes in an image using edge-based analysis
   * Finds the foreground object bounding box and computes shape metrics
   * @private
   */
  _detectShapes(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const pixels = imageData.data;
    
    // Convert to grayscale and compute gradient magnitude (Sobel-like)
    const gray = new Float32Array(width * height);
    for (let i = 0; i < pixels.length; i += 4) {
      gray[i / 4] = pixels[i] * 0.299 + pixels[i+1] * 0.587 + pixels[i+2] * 0.114;
    }
    
    // Compute edge magnitude
    const edgeMag = new Float32Array(width * height);
    let totalEdge = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const gx = -gray[idx - width - 1] + gray[idx - width + 1]
                  - 2 * gray[idx - 1] + 2 * gray[idx + 1]
                  - gray[idx + width - 1] + gray[idx + width + 1];
        const gy = -gray[idx - width - 1] - 2 * gray[idx - width] - gray[idx - width + 1]
                  + gray[idx + width - 1] + 2 * gray[idx + width] + gray[idx + width + 1];
        edgeMag[idx] = Math.sqrt(gx * gx + gy * gy);
        totalEdge += edgeMag[idx];
      }
    }
    
    // Find edge threshold (Otsu-like: use mean + 0.5 * stddev)
    const meanEdge = totalEdge / (width * height);
    let variance = 0;
    for (let i = 0; i < edgeMag.length; i++) {
      variance += (edgeMag[i] - meanEdge) ** 2;
    }
    const stddev = Math.sqrt(variance / edgeMag.length);
    const edgeThreshold = meanEdge + 0.5 * stddev;
    
    // Find bounding box of strong edge pixels (the object)
    let minX = width, maxX = 0, minY = height, maxY = 0;
    let edgePixelCount = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (edgeMag[y * width + x] > edgeThreshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          edgePixelCount++;
        }
      }
    }
    
    // Fallback if no edges found
    if (maxX <= minX || maxY <= minY) {
      minX = 0; maxX = width; minY = 0; maxY = height;
    }
    
    const objWidth = maxX - minX;
    const objHeight = maxY - minY;
    const aspectRatio = objWidth / Math.max(1, objHeight);
    const boundingArea = objWidth * objHeight;
    
    // Rectangularity: how much of the bounding box is filled by edge pixels
    const edgeDensity = edgePixelCount / Math.max(1, boundingArea);
    const rectangularity = Math.min(1.0, Math.max(0.0, 1.0 - Math.abs(aspectRatio - 1.5) / 3 + edgeDensity * 0.3));
    
    // Roundness: based on aspect ratio near 1.0 and edge distribution
    const roundness = Math.min(1.0, Math.max(0.0, 1.0 - Math.abs(aspectRatio - 1.0) * 1.5));
    
    // Squareness
    const squareness = Math.min(1.0, Math.max(0.0, 1.0 - Math.abs(aspectRatio - 1.0) * 2.5));
    
    // Complexity: based on edge density relative to perimeter
    const perimeter = 2 * (objWidth + objHeight);
    const complexity = Math.min(1.0, edgePixelCount / Math.max(1, perimeter * 2));
    
    // Symmetry: compare left-right edge distribution
    let leftEdges = 0, rightEdges = 0;
    const midX = (minX + maxX) / 2;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (edgeMag[y * width + x] > edgeThreshold) {
          if (x < midX) leftEdges++;
          else rightEdges++;
        }
      }
    }
    const symmetry = 1.0 - Math.abs(leftEdges - rightEdges) / Math.max(1, leftEdges + rightEdges);
    
    // Compactness: ratio of edge pixels to bounding box area
    const compactness = Math.min(1.0, (edgePixelCount / Math.max(1, boundingArea)) * 10);
    
    // Circularity: 4π * area / perimeter²
    const circularity = Math.min(1.0, (4 * Math.PI * edgePixelCount) / Math.max(1, perimeter * perimeter));
    
    return {
      aspectRatio,
      rectangularity,
      roundness,
      squareness,
      complexity,
      circularity: Math.max(circularity, roundness * 0.5),
      symmetry,
      compactness
    };
  }
  
  /**
   * Get labels based on detected shapes
   * @private
   */
  _getLabelsFromShapes(shapes) {
    // Only return geometric descriptors — never guess specific object types here.
    // Object identification is handled exclusively by Cloud Vision API.
    const labels = [];

    if (shapes.aspectRatio > 4) {
      labels.push('elongated', 'narrow');
    } else if (shapes.rectangularity > 0.8) {
      labels.push(Math.abs(shapes.aspectRatio - 1.0) < 0.2 ? 'square' : 'rectangular');
    }

    if (shapes.roundness > 0.8) {
      labels.push('round');
    }

    return labels;
  }
  
  /**
   * Detect edges in an image using Sobel filter
   * @private
   */
  _detectEdges(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const pixels = imageData.data;
    
    // Convert to grayscale
    const gray = new Float32Array(width * height);
    for (let i = 0; i < pixels.length; i += 4) {
      gray[i / 4] = pixels[i] * 0.299 + pixels[i+1] * 0.587 + pixels[i+2] * 0.114;
    }
    
    // Apply Sobel filter and count edge pixels
    let edgeCount = 0;
    let totalMag = 0;
    const totalPixels = (width - 2) * (height - 2);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const gx = -gray[idx - width - 1] + gray[idx - width + 1]
                  - 2 * gray[idx - 1] + 2 * gray[idx + 1]
                  - gray[idx + width - 1] + gray[idx + width + 1];
        const gy = -gray[idx - width - 1] - 2 * gray[idx - width] - gray[idx - width + 1]
                  + gray[idx + width - 1] + 2 * gray[idx + width] + gray[idx + width + 1];
        const mag = Math.sqrt(gx * gx + gy * gy);
        totalMag += mag;
        if (mag > 30) edgeCount++; // threshold for significant edge
      }
    }
    
    return {
      count: edgeCount,
      density: edgeCount / Math.max(1, totalPixels),
      averageMagnitude: totalMag / Math.max(1, totalPixels)
    };
  }
  
  /**
   * Analyze image texture using pixel variance and neighbor differences
   * @private
   */
  _analyzeTexture(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const pixels = imageData.data;
    
    // Convert to grayscale
    const gray = new Float32Array(width * height);
    for (let i = 0; i < pixels.length; i += 4) {
      gray[i / 4] = pixels[i] * 0.299 + pixels[i+1] * 0.587 + pixels[i+2] * 0.114;
    }
    
    // Coarseness: average absolute difference between pixels at different scales
    // High coarseness = large uniform regions (fabric, leather)
    // Low coarseness = fine detail (metal, glass)
    let fineDiff = 0, coarseDiff = 0;
    let fineCount = 0, coarseCount = 0;
    const step2 = 2, step8 = 8;
    
    for (let y = 0; y < height - step8; y += 4) {
      for (let x = 0; x < width - step8; x += 4) {
        const idx = y * width + x;
        // Fine scale: nearby pixels
        fineDiff += Math.abs(gray[idx] - gray[idx + step2]);
        fineDiff += Math.abs(gray[idx] - gray[idx + step2 * width]);
        fineCount += 2;
        // Coarse scale: distant pixels
        coarseDiff += Math.abs(gray[idx] - gray[idx + step8]);
        coarseDiff += Math.abs(gray[idx] - gray[idx + step8 * width]);
        coarseCount += 2;
      }
    }
    
    const fineAvg = fineCount > 0 ? fineDiff / fineCount : 0;
    const coarseAvg = coarseCount > 0 ? coarseDiff / coarseCount : 0;
    // If coarse differences >> fine differences, texture is coarse
    const coarseness = coarseAvg > 0 ? Math.min(1.0, (coarseAvg - fineAvg) / coarseAvg) : 0;
    
    // Contrast: standard deviation of grayscale values (normalized)
    let mean = 0;
    for (let i = 0; i < gray.length; i++) mean += gray[i];
    mean /= gray.length;
    let varianceSum = 0;
    for (let i = 0; i < gray.length; i++) varianceSum += (gray[i] - mean) ** 2;
    const contrast = Math.min(1.0, Math.sqrt(varianceSum / gray.length) / 128);
    
    // Directionality: compare horizontal vs vertical gradients
    let hGrad = 0, vGrad = 0, gradCount = 0;
    for (let y = 1; y < height - 1; y += 2) {
      for (let x = 1; x < width - 1; x += 2) {
        const idx = y * width + x;
        hGrad += Math.abs(gray[idx + 1] - gray[idx - 1]);
        vGrad += Math.abs(gray[idx + width] - gray[idx - width]);
        gradCount++;
      }
    }
    const hAvg = gradCount > 0 ? hGrad / gradCount : 0;
    const vAvg = gradCount > 0 ? vGrad / gradCount : 0;
    const directionality = (hAvg + vAvg) > 0 ? Math.abs(hAvg - vAvg) / (hAvg + vAvg) : 0;
    
    // Roughness: combination of coarseness and contrast
    const roughness = Math.min(1.0, coarseness + contrast * 0.5);
    
    // Regularity: measure how uniform the local variance is across image blocks
    const blockSize = Math.max(4, Math.floor(Math.min(width, height) / 8));
    const blockVars = [];
    for (let by = 0; by < height - blockSize; by += blockSize) {
      for (let bx = 0; bx < width - blockSize; bx += blockSize) {
        let bMean = 0, bCount = 0;
        for (let y = by; y < by + blockSize; y++) {
          for (let x = bx; x < bx + blockSize; x++) {
            bMean += gray[y * width + x];
            bCount++;
          }
        }
        bMean /= bCount;
        let bVar = 0;
        for (let y = by; y < by + blockSize; y++) {
          for (let x = bx; x < bx + blockSize; x++) {
            bVar += (gray[y * width + x] - bMean) ** 2;
          }
        }
        blockVars.push(bVar / bCount);
      }
    }
    let varMean = 0;
    for (const v of blockVars) varMean += v;
    varMean /= Math.max(1, blockVars.length);
    let varOfVar = 0;
    for (const v of blockVars) varOfVar += (v - varMean) ** 2;
    varOfVar /= Math.max(1, blockVars.length);
    const regularity = varMean > 0 ? Math.max(0, 1.0 - Math.sqrt(varOfVar) / varMean) : 0;
    
    return { coarseness, contrast, directionality, roughness, regularity };
  }
  
  /**
   * Get labels from texture analysis
   * @private
   */
  _getLabelsFromTexture(texture) {
    // Only return generic texture descriptors — no specific material guesses.
    const labels = [];

    if (texture.coarseness > 0.7) {
      labels.push('textured');
    } else if (texture.coarseness < 0.3) {
      labels.push('smooth');
    }

    return labels;
  }
  
  /**
   * Calculate image brightness
   * @private
   */
  _calculateBrightness(pixels) {
    let total = 0;
    let count = 0;
    
    for (let i = 0; i < pixels.length; i += 4) {
      total += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      count++;
    }
    
    return total / (count * 255); // Normalize to 0-1
  }
  
  /**
   * Calculate image contrast using standard deviation of luminance
   * @private
   */
  _calculateContrast(pixels) {
    let sum = 0;
    let count = 0;
    
    // Calculate mean luminance
    for (let i = 0; i < pixels.length; i += 4) {
      sum += pixels[i] * 0.299 + pixels[i+1] * 0.587 + pixels[i+2] * 0.114;
      count++;
    }
    const mean = sum / count;
    
    // Calculate variance
    let varianceSum = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const lum = pixels[i] * 0.299 + pixels[i+1] * 0.587 + pixels[i+2] * 0.114;
      varianceSum += (lum - mean) ** 2;
    }
    
    // Normalize standard deviation to 0-1 range (max possible stddev for 0-255 is ~128)
    return Math.min(1.0, Math.sqrt(varianceSum / count) / 128);
  }
  
  /**
   * Create image fingerprint using dHash for better matching
   * @private
   */
  _createImageFingerprint(imageData) {
    // Use dHash for a proper perceptual hash
    // First resize to 64x64 for standardized comparison
    const resizeCanvas = document.createElement('canvas');
    const resizeCtx = resizeCanvas.getContext('2d');
    resizeCanvas.width = 64;
    resizeCanvas.height = 64;
    
    // Put original imageData into a temp canvas, then resize
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    tempCtx.putImageData(imageData, 0, 0);
    
    resizeCtx.drawImage(tempCanvas, 0, 0, 64, 64);
    const smallData = resizeCtx.getImageData(0, 0, 64, 64);
    
    // Store the color histogram for later comparison
    this._lastColorHistogram = this._createColorHistogram(smallData.data);
    
    return this._createDHash(smallData);
  }
  
  /**
   * Calculate title match score
   * @private
   */
  _calculateTitleScore(item, labels) {
    if (!item.title) return 0;
    
    const title = item.title.toLowerCase();
    let matchCount = 0;
    
    labels.forEach((label, i) => {
      if (title.includes(label)) {
        matchCount += 1 / (i + 1);
      }
    });

    return Math.min(1, matchCount);
  }
  
  /**
   * Calculate category match score
   * @private
   */
  _calculateCategoryScore(item, labels) {
    if (!item.category) return 0;
    
    const category = item.category.toLowerCase();
    let score = 0;
    
    // Direct category match
    if (labels.includes(category)) {
      score += 0.7;
    }
    
    // Check if any label belongs to this category
    const categoryKeywords = this.categoryKeywords[category] || [];
    labels.forEach(label => {
      if (categoryKeywords.includes(label)) {
        score += 0.2;
      }
    });
    
    return Math.min(1, score);
  }
  
  /**
   * Calculate description match score
   * @private
   */
  _calculateDescriptionScore(item, labels) {
    if (!item.description) return 0;
    
    const description = item.description.toLowerCase();
    let matchCount = 0;
    
    labels.forEach((label, i) => {
      if (description.includes(label)) {
        matchCount += 1 / (i + 1);
      }
    });
    
    return Math.min(1, matchCount * 0.2);
  }
  
  /**
   * Match query Vision labels directly against item title/description.
   * Uses the Vision confidence score as the match weight, so a high-confidence
   * "Pen" label strongly promotes items whose title contains "pen".
   * @private
   */
  _calculateLabelTitleScore(item, queryVisionLabels) {
    if (!queryVisionLabels || queryVisionLabels.length === 0) return 0;
    const title = (item.title || '').toLowerCase();
    const description = (item.description || '').toLowerCase();
    let bestScore = 0;

    // Generic material/attribute words that Vision often detects but that appear
    // in many unrelated item titles (e.g. "leather" appears in both jacket AND shoes).
    // These should not drive a high label-title match on their own.
    const ATTRIBUTE_LABELS = new Set([
      // Materials / construction
      'leather', 'fabric', 'textile', 'material', 'plastic', 'metal', 'rubber',
      'glass', 'wood', 'paper', 'cloth', 'cotton', 'polyester', 'nylon', 'suede',
      // Parts / hardware
      'pocket', 'zipper', 'button', 'strap', 'handle', 'cord', 'wire', 'cable',
      'sleeve', 'collar', 'lining', 'sole', 'clasp', 'buckle', 'lace', 'chain',
      // Generic / aesthetic
      'fashion', 'style', 'design', 'pattern', 'product', 'object', 'item',
      'apparel', 'clothing', 'wear', 'garment', 'accessory', 'hardware',
      'surface', 'texture', 'smooth', 'glossy', 'matte',
      // Broad category words — these are too generic to uniquely identify an item type.
      // "Bag" appearing in a wallet query would otherwise match "Louis Vuitton Bag" at full weight.
      'bag', 'case', 'container', 'pouch', 'device', 'equipment', 'tool', 'gear',
    ]);

    for (const label of queryVisionLabels) {
      const text = label.description.toLowerCase();
      const weight = label.score || 0.5;
      // Material/attribute labels get a heavy penalty so they can't masquerade as object matches.
      const attrMult = ATTRIBUTE_LABELS.has(text) ? 0.25 : 1.0;

      if (title.includes(text) || text.includes(title)) {
        bestScore = Math.max(bestScore, weight * attrMult);
      } else {
        // Word-level partial match (e.g. "pen" in "Ballpen")
        for (const word of title.split(/\s+/)) {
          if (word.length > 2 && (text.includes(word) || word.includes(text))) {
            bestScore = Math.max(bestScore, weight * 0.75 * attrMult);
            break;
          }
        }
      }

      // Synonym expansion: Vision uses generic category labels ("writing implement") that
      // won't match specific item titles ("Black Pen") without this bridge.
      if (bestScore < weight * attrMult) {
        const synonyms = VISION_LABEL_SYNONYMS[text] || [];
        for (const syn of synonyms) {
          if (title.includes(syn) || syn.includes(title)) {
            bestScore = Math.max(bestScore, weight * 0.80 * attrMult);
            break;
          }
          for (const word of title.split(/\s+/)) {
            if (word.length > 2 && (syn.includes(word) || word.includes(syn))) {
              bestScore = Math.max(bestScore, weight * 0.60 * attrMult);
              break;
            }
          }
        }
      }

      // Description match — lower weight since description text is looser
      if (description.includes(text) && bestScore < weight * 0.45 * attrMult) {
        bestScore = Math.max(bestScore, weight * 0.45 * attrMult);
      }
    }

    return bestScore;
  }

  // Color, object, and feature scores are now handled by direct image comparison
  // in findSimilarItems via _compareFingerprints and _compareColorHistograms

  /**
   * Weighted multi-track semantic score between query and stored Vision data.
   * Tracks are scored separately with explicit weights so high-signal features
   * (OCR text, detected objects) outrank low-signal ones (generic labels).
   *
   * Weights: OCR ×5 · object ×3 · webEntity ×3 · label ×2
   * Each hit is multiplied by the Vision confidence score, so a 0.95 "backpack"
   * outranks a 0.70 "backpack" rather than counting equally.
   *
   * @param {Array<{description,score}>} queryLabels      - query Vision labels
   * @param {Array<{description,score}>} storedLabels     - item.visionLabels
   * @param {Array<{name,score}>}        storedObjects    - item.visionObjects
   * @param {Array<{description,score}>} storedWebEntities - item.visionWebEntities
   * @param {Array<{token,conf}>}        queryOcrTokens   - OCR tokens from query image
   * @param {string}                     storedVisionText - item.visionText (raw OCR string)
   * @returns {number} 0–1
   * @private
   */
  _calculateVisionLabelMatchScore(queryLabels, storedLabels, storedObjects = [], storedWebEntities = [], queryOcrTokens = [], storedVisionText = '') {
    if (!queryLabels || queryLabels.length === 0) return 0;
    if (!storedLabels || storedLabels.length === 0) return 0;

    const WEIGHTS = { ocr: 5, object: 3, webEntity: 3, label: 2 };

    const normalize = (arr, key = 'description') => {
      const map = new Map();
      for (const it of arr) {
        const text = ((it[key] || it.name) || '').toLowerCase().trim();
        if (text && !this.backgroundLabels.has(text))
          map.set(text, Math.max(map.get(text) || 0, it.score || 0));
      }
      return map;
    };

    const lMap = normalize(storedLabels);
    const oMap = normalize(storedObjects, 'name');
    const eMap = normalize(storedWebEntities);

    // Tokenize stored OCR text — short tokens and background terms are noise
    const storedOcrSet = new Set(
      (storedVisionText || '').toLowerCase().split(/[\s\W]+/).filter(t => t.length > 2 && !this.backgroundLabels.has(t))
    );

    let totalScore = 0, totalMax = 0;

    // ── OCR track (weight 5) ─────────────────────────────────────
    for (const { token, conf } of queryOcrTokens) {
      const w = WEIGHTS.ocr * conf;
      totalMax += w;
      if (storedOcrSet.has(token)) totalScore += w;
    }

    // ── Per-label: three parallel tracks ─────────────────────────
    for (const qLabel of queryLabels) {
      const text = qLabel.description.toLowerCase();
      const conf = qLabel.score || 0.5;

      // Object track (weight 3) — highest-precision stored signal
      totalMax   += WEIGHTS.object * conf;
      totalScore += WEIGHTS.object * conf * this._hitScore(text, oMap);

      // WebEntity track (weight 3) — brand / product-name signals
      totalMax   += WEIGHTS.webEntity * conf;
      totalScore += WEIGHTS.webEntity * conf * this._hitScore(text, eMap);

      // Label track (weight 2) — general scene / category labels
      totalMax   += WEIGHTS.label * conf;
      totalScore += WEIGHTS.label * conf * this._hitScore(text, lMap);
    }

    if (totalMax === 0) return 0;
    const rawScore = totalScore / totalMax;

    // Mild curve: 25%+ raw overlap is a meaningful match for lost-and-found
    if (rawScore >= 0.50) return 0.85 + (rawScore - 0.50) * 0.30;
    if (rawScore >= 0.25) return 0.50 + (rawScore - 0.25) * 1.40;
    return rawScore * 2.0;
  }

  /**
   * Score a query token against a stored Map<text, confidence>.
   * Returns: stored confidence on exact match; partial/synonym credit on soft match; 0 on miss.
   * @private
   */
  _hitScore(text, map) {
    if (map.has(text)) return map.get(text); // exact match

    let best = 0;
    for (const [key, val] of map) {
      if (key.includes(text) || text.includes(key))
        best = Math.max(best, val * 0.5); // substring credit
    }

    // Forward synonym ("writing implement" → ["pen", "pencil"])
    for (const syn of (VISION_LABEL_SYNONYMS[text] || [])) {
      if (map.has(syn)) best = Math.max(best, map.get(syn) * 0.7);
    }
    // Reverse synonym (stored "writing implement" matches query "pen")
    for (const [key, val] of map) {
      if ((VISION_LABEL_SYNONYMS[key] || []).includes(text))
        best = Math.max(best, val * 0.7);
    }

    return best;
  }

  /**
   * Infer the probable category of the query image from its Vision labels.
   * Returns a category key (from this.categoryKeywords) or null if uncertain.
   * @param {Array<{description,score}>} labels
   * @returns {string|null}
   * @private
   */
  _inferCategoryFromLabels(labels) {
    if (!labels || labels.length === 0) return null;

    // Category MUST be driven by the primary label (index 0) — the highest-confidence
    // detected object. Letting secondary/background labels vote causes the category to
    // reflect background items (e.g. background shoes when searching for a phone).
    const primaryText = labels[0].description.toLowerCase();

    for (const [category, keywords] of Object.entries(this.categoryKeywords)) {
      if (keywords.some(kw => primaryText.includes(kw) || kw.includes(primaryText))) {
        return category;
      }
    }

    // If primary label alone doesn't match, try a weighted vote:
    // primary counts 3x, all others combined count 1x — still primary-dominant.
    const labelTexts = labels.map(l => l.description.toLowerCase());
    let bestCategory = null;
    let bestScore = 0;

    for (const [category, keywords] of Object.entries(this.categoryKeywords)) {
      let weightedMatches = 0;
      const totalWeight = 3.0 + (labels.length - 1);
      for (let i = 0; i < labels.length; i++) {
        const w = i === 0 ? 3.0 : 1.0;
        const lt = labelTexts[i];
        if (keywords.some(kw => lt.includes(kw) || kw.includes(lt))) {
          weightedMatches += w;
        }
      }
      const score = weightedMatches / totalWeight;
      if (score > bestScore && score > 0.20) {
        bestScore = score;
        bestCategory = category;
      }
    }

    return bestCategory;
  }

  /**
   * Return false only when two categories are clearly incompatible.
   * Defaults to true (compare items) when either category is unknown.
   * @param {string|null} inferredCategory
   * @param {string} itemCategory
   * @returns {boolean}
   * @private
   */
  _categoriesAreCompatible(inferredCategory, itemCategory) {
    if (!inferredCategory || !itemCategory) return true;

    // Map Firestore category values (from add-item.html select options) to keyword-category keys
    // so the incompatible check fires for stored items.
    const categoryMap = {
      // Actual Firestore category values
      'gadgets':         'electronics',
      'bags-wallets':    'accessories',
      'accessories':     'accessories',
      'garments':        'clothing',
      'eyewear':         'accessories',
      'cosmetics':       'personal',
      'supplies':        'stationery',
      'umbrella':        'personal',
      'toys':            'personal',
      'food-containers': 'personal',
      'cash-cards':      'documents',
      'documents':       'documents',
      'keys':            'personal',
      'other':           null,
      // Legacy / freeform values some items may carry
      'phone': 'electronics', 'smartphone': 'electronics', 'laptop': 'electronics',
      'tablet': 'electronics', 'camera': 'electronics', 'headphones': 'electronics',
      'bag': 'accessories', 'wallet': 'accessories', 'purse': 'accessories',
      'shoes': 'clothing', 'shoe': 'clothing', 'footwear': 'clothing',
      'jacket': 'clothing', 'shirt': 'clothing', 'pants': 'clothing',
      'pen': 'stationery', 'pencil': 'stationery', 'marker': 'stationery',
      'notebook': 'stationery', 'book': 'documents', 'id': 'documents', 'card': 'documents',
    };

    const mapped = categoryMap[itemCategory.toLowerCase()];
    if (mapped === null) return true; // 'other' — never exclude
    const normalizedItem = mapped || itemCategory.toLowerCase();

    // 'accessories' is intentionally absent from the electronics blocklist:
    // smartwatches, wireless earbuds, etc. straddle both categories.
    // Similarly 'electronics' is absent from accessories: a wristwatch is accessories,
    // a smart band could be electronics — don't block either direction.
    const incompatible = {
      'electronics': ['clothing', 'stationery', 'documents', 'personal'],
      'clothing':    ['electronics', 'stationery', 'documents'],
      'stationery':  ['electronics', 'clothing', 'accessories', 'personal'],
      'documents':   ['electronics', 'clothing', 'personal', 'accessories'],
      'accessories': ['clothing', 'stationery', 'documents'],
      'personal':    ['electronics', 'clothing', 'documents', 'stationery']
    };

    const blocklist = incompatible[inferredCategory] || [];
    return !blocklist.includes(normalizedItem);
  }
}

// Export globally
window.ImprovedImageAnalyzer = new ImprovedImageAnalyzer();
