function _rgbToColorName(r, g, b) {
    // Convert to HSL for perceptually accurate naming
    // (Euclidean RGB distance is unreliable — e.g. pinkish colours map to "Silver")
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    const l = (max + min) / 2;

    let h = 0, s = 0;
    if (delta > 0.001) {
        s = delta / (1 - Math.abs(2 * l - 1));
        if (max === rn)      h = 60 * (((gn - bn) / delta) % 6);
        else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
        else                 h = 60 * ((rn - gn) / delta + 4);
        if (h < 0) h += 360;
    }

    // Achromatic / near-achromatic — name by lightness only
    if (s < 0.12) {
        if (l < 0.12) return 'Black';
        if (l < 0.30) return 'Dark Gray';
        if (l < 0.55) return 'Gray';
        if (l < 0.80) return 'Silver';
        return 'White';
    }

    // Very dark chromatic colours
    if (l < 0.18) {
        if (h < 30 || h >= 330) return 'Dark Red';
        if (h < 150) return 'Dark Green';
        if (h < 265) return 'Navy';
        return 'Purple';
    }

    // Chromatic colours — determined by hue, lightness, saturation
    if (h < 15 || h >= 345) return l > 0.55 ? 'Pink'       : 'Red';
    if (h < 35)  return s < 0.45 && l > 0.50 ? 'Tan'       : l < 0.35 ? 'Brown'  : 'Orange';
    if (h < 65)  return l > 0.55              ? 'Yellow'    : 'Gold';
    if (h < 80)  return s > 0.4               ? 'Yellow'    : 'Olive';
    if (h < 150) return l < 0.30              ? 'Dark Green' : 'Green';
    if (h < 175) return 'Teal';
    if (h < 200) return 'Cyan';
    if (h < 260) return l < 0.30              ? 'Navy'      : 'Blue';
    if (h < 285) return 'Purple';
    if (h < 345) return l > 0.55              ? 'Pink'      : 'Violet';
    return 'Pink';
}

class AccurateImageSearch {
    constructor() {
        // DOM elements
        this.uploadBtn = document.getElementById('uploadBtn');
        this.imageUpload = document.getElementById('imageUpload');
        this.imagePreview = document.getElementById('imagePreview');
        this.findMatchesBtn = document.getElementById('findMatchesBtn');
        this.searchResults = document.getElementById('searchResults');
        
        // Keep track of the currently selected image
        this.selectedImage = null;
        
        console.log('Accurate Image Search initialized');
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Trigger file input when upload button is clicked
        this.uploadBtn.addEventListener('click', () => {
            this.imageUpload.click();
        });

        // Handle file selection
        this.imageUpload.addEventListener('change', (e) => {
            this.handleImageUpload(e);
        });

        // Find matches button
        this.findMatchesBtn.addEventListener('click', () => {
            this.findSimilarItems();
        });
    }

    handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Check if the file is an image
        if (!file.type.match('image.*')) {
            alert('Please select a valid image file (JPEG, PNG, etc.)');
            return;
        }

        // Store the selected image
        this.selectedImage = file;

        // Create a preview of the uploaded image
        const reader = new FileReader();
        reader.onload = (e) => {
            this.imagePreview.innerHTML = `
                <img src="${e.target.result}" alt="Preview">
            `;
            this.findMatchesBtn.disabled = false;
            this.searchResults.innerHTML = ''; // Clear previous results
        };
        reader.readAsDataURL(file);
    }

    async findSimilarItems() {
        if (!this.selectedImage) {
            alert('Please select an image first');
            return;
        }

        // Show loading state
        this.findMatchesBtn.disabled = true;
        this.findMatchesBtn.innerHTML = '<span class="loading">Analyzing image...</span>';
        this.searchResults.innerHTML = '<p class="searching">Analyzing image with AI...</p>';
        // Expand modal when analyzing
        document.querySelector('.image-search-modal-content')?.classList.add('has-results');

        try {
            // Step 1: Local pixel/hash analysis (fast, works offline)
            const analysisResults = await window.ImprovedImageAnalyzer.analyzeImage(this.selectedImage);
            console.log('Local image analysis results:', analysisResults);

            // Step 2: Cloud Vision analysis (semantic labels, brand detection)
            // Merges real Vision labels into analysisResults — improves search quality
            if (window.CloudVision && window.CloudVision.available) {
                try {
                    this.searchResults.innerHTML = '<p class="searching">Analyzing image...</p>';
                    const visionResults = await window.CloudVision.analyzeImage(this.selectedImage);
                    // Accept the Vision result if it has labels OR localized objects —
                    // product catalog images often return only localizedObjectAnnotations.
                    const _hasLabels  = Array.isArray(visionResults && visionResults.labelAnnotations) && visionResults.labelAnnotations.length > 0;
                    const _hasObjects = Array.isArray(visionResults && visionResults.localizedObjectAnnotations) && visionResults.localizedObjectAnnotations.length > 0;
                    if (visionResults && (_hasLabels || _hasObjects)) {
                        // Labels that identify environment/background or are non-object descriptors
                        const BG_LABELS = new Set([
                            // Scene / environment
                            'pattern','textile','linens','linen','fabric','cloth','tablecloth',
                            'bedding','furniture','table','desk','floor','flooring','wood',
                            'concrete','surface','background','wall','ceiling','tile','carpet',
                            'rug','mat','nature','sky','grass','ground','soil','road','pavement',
                            'room','indoor','outdoor','interior','exterior','still life',
                            'photography','stock photography','product photography','shadow',
                            'light','lighting','darkness','monochrome','black and white',
                            'diagonal','line','lines','stripe','stripes','plaid',
                            // Pure color words — colors belong in the color swatches, not object labels
                            'pink','red','blue','green','yellow','orange','purple','violet',
                            'brown','beige','white','black','gray','grey','silver','gold',
                            'cyan','magenta','teal','maroon','navy','turquoise','crimson',
                            'ivory','lavender','peach','coral','mint','rose','scarlet',
                            // Abstract descriptors
                            'paint','color','colour','hue','shade','tone','tint','dye',
                            // Catch-all product/visual labels Vision returns for almost any clear photo
                            'product','material','object','item','goods','supply','supplies',
                            'rectangle','font','logo','sign','photograph','snapshot','image',
                            'illustration','graphic','macro photography','close up','close-up',
                            'number','digit','symbol','icon'
                        ]);

                        // Filter: remove background/color labels and require ≥ 0.5 confidence
                        // (confidence now acts as a score multiplier in ranking, not just a gate)
                        const filteredLabels = (visionResults.labelAnnotations || [])
                            .filter(l => !BG_LABELS.has(l.description.toLowerCase()) && l.score >= 0.5);

                        // Sort localized objects so the one closest to the image center ranks
                        // first. The item the user is searching for is almost always what they
                        // centered in the frame; background clutter (shoes, people, etc.) sits
                        // at the edges and must not override the primary subject.
                        const _subjectScore = (obj) => {
                            const verts = (obj.boundingPoly && obj.boundingPoly.normalizedVertices) || [];
                            let cx = 0.5, cy = 0.5, area = 0;
                            if (verts.length >= 2) {
                                const xs = verts.map(v => v.x || 0);
                                const ys = verts.map(v => v.y || 0);
                                const minX = Math.min(...xs), maxX = Math.max(...xs);
                                const minY = Math.min(...ys), maxY = Math.max(...ys);
                                cx = (minX + maxX) / 2;
                                cy = (minY + maxY) / 2;
                                area = (maxX - minX) * (maxY - minY);
                            }
                            const dist = Math.sqrt((cx - 0.5) ** 2 + (cy - 0.5) ** 2);
                            const centerProximity = Math.max(0, 1 - dist * 2.5);
                            const areaScore = Math.min(1, area * 3);
                            // 50% center, 30% vision confidence, 20% size
                            return centerProximity * 0.50 + (obj.score || 0.5) * 0.30 + areaScore * 0.20;
                        };

                        const localized = (visionResults.localizedObjectAnnotations || [])
                            .slice() // don't mutate the original
                            .sort((a, b) => _subjectScore(b) - _subjectScore(a));

                        const objLabels = localized.slice(0, 1).map(o => ({
                            description: o.name,
                            score: Math.min(0.99, (o.score || 0.8) + 0.15)
                        }));

                        // Merge: center-prioritized localized label first, then filtered scene labels (deduped)
                        const seenLower = new Set(objLabels.map(l => l.description.toLowerCase()));
                        const mergedLabels = [
                            ...objLabels,
                            ...filteredLabels.filter(l => !seenLower.has(l.description.toLowerCase()))
                        ];

                        // Fall back gracefully: filtered → original
                        analysisResults.labelAnnotations =
                            mergedLabels.length  > 0 ? mergedLabels  :
                            filteredLabels.length > 0 ? filteredLabels :
                            visionResults.labelAnnotations;

                        analysisResults.visionWebEntities = (visionResults.webDetection && visionResults.webDetection.webEntities) || [];
                        analysisResults.textAnnotations = visionResults.textAnnotations || [];

                        // Crop to the most-centered object's bounding box so background
                        // distractions don't pollute the fingerprint or color display.
                        // IMPORTANT: save the full-image fingerprint before cropping so that
                        // findSimilarItems can compare BOTH the cropped and full fingerprints.
                        // Stored item features are always computed from the full image, so
                        // comparing only the cropped fingerprint causes exact-match images to
                        // score poorly (cropped ≠ full even for the identical photo).
                        analysisResults._fullImageFingerprint = analysisResults.imageFingerprint;
                        analysisResults._fullColorHistogram   = analysisResults._colorHistogram;
                        analysisResults._fullPixelData        = analysisResults._pixelData;

                        const objects = localized; // already center-sorted above
                        let bboxApplied = false;
                        if (objects.length > 0) {
                            const verts = (objects[0].boundingPoly && objects[0].boundingPoly.normalizedVertices) || [];
                            if (verts.length >= 4) {
                                const xs = verts.map(v => v.x || 0);
                                const ys = verts.map(v => v.y || 0);
                                const bbox = {
                                    x1: Math.max(0, Math.min(...xs)),
                                    y1: Math.max(0, Math.min(...ys)),
                                    x2: Math.min(1, Math.max(...xs)),
                                    y2: Math.min(1, Math.max(...ys))
                                };
                                const area = (bbox.x2 - bbox.x1) * (bbox.y2 - bbox.y1);
                                // Only crop when bbox is a meaningful sub-region (5%–97% of image)
                                if (area > 0.05 && area < 0.97) {
                                    const cropped = await window.ImprovedImageAnalyzer.recomputeFeaturesFromBBox(this.selectedImage, bbox);
                                    if (cropped) {
                                        analysisResults.imageFingerprint  = cropped.fingerprint;
                                        analysisResults._colorHistogram   = cropped.colorHistogram;
                                        analysisResults.imagePropertiesAnnotation = {
                                            dominantColors: { colors: cropped.dominantColors }
                                        };
                                        bboxApplied = true;
                                    }
                                }
                            }
                        }
                        // Fall back to Vision's full-image colors if no valid bbox
                        if (!bboxApplied && visionResults.imagePropertiesAnnotation) {
                            analysisResults.imagePropertiesAnnotation = visionResults.imagePropertiesAnnotation;
                        }
                        analysisResults._visionLabelsAvailable = true;
                        console.log('Cloud Vision labels merged:', (visionResults.labelAnnotations || []).length, 'labels +', (visionResults.localizedObjectAnnotations || []).length, 'objects', bboxApplied ? '(bbox crop applied)' : '');
                    } else {
                        console.warn('Cloud Vision returned empty labels:', visionResults);
                        analysisResults._visionFailed = true;
                    }
                } catch (visionErr) {
                    console.error('Cloud Vision failed:', visionErr.message);
                    analysisResults._visionFailed = true;
                }
            }

            // Display analysis results
            this.searchResults.innerHTML = '<p class="analysis-results">Image Analysis Complete</p>';
            this.displayAnalysisResults(analysisResults);

            // Find similar items based on the analysis
            // Pass the user-selected category for hard pre-filtering
            const userCategory = document.getElementById('searchCategory')?.value || null;
            const matchingItems = await window.ImprovedImageAnalyzer.findSimilarItems(analysisResults, userCategory || null);

            // Display the results
            this.displaySearchResults(matchingItems, analysisResults);
        } catch (error) {
            console.error('Error finding similar items:', error);
            this.searchResults.innerHTML = `
                <p class="error">An error occurred during image analysis: ${error.message}</p>
                <p>Please try again or use text search instead.</p>
            `;
        } finally {
            this.findMatchesBtn.disabled = false;
            this.findMatchesBtn.textContent = 'Find Matches';
        }
    }

    /**
     * Display analysis results
     */
    displayAnalysisResults(analysisResults) {
        // Extract labels — only show Detected Objects when Cloud Vision provided them.
        // Local shape/color labels are unreliable for object identification.
        let labelsHtml = '';
        if (analysisResults._visionLabelsAvailable && analysisResults.labelAnnotations && analysisResults.labelAnnotations.length > 0) {
            labelsHtml = `
                <div class="analysis-section">
                    <h4>Detected Objects</h4>
                    <div class="label-container">
                        ${analysisResults.labelAnnotations.slice(0, 8).map(label => `
                            <span class="label">${label.description}</span>
                        `).join('')}
                    </div>
                </div>
            `;
        } else if (analysisResults._visionFailed || !analysisResults._visionLabelsAvailable) {
            labelsHtml = `
                <div class="analysis-section">
                    <div class="vision-warning">Object detection unavailable — try a clearer photo with the item centered on a plain background. Results may be less accurate.</div>
                </div>
            `;
        }
        
        // Extract colors if available
        let colorsHtml = '';
        if (analysisResults.imagePropertiesAnnotation &&
            analysisResults.imagePropertiesAnnotation.dominantColors) {
            const colors = analysisResults.imagePropertiesAnnotation.dominantColors.colors;
            if (colors && colors.length > 0) {
                const sortedColors = colors
                    .filter(c => c.color)
                    .sort((a, b) => (b.pixelFraction || b.score || 0) - (a.pixelFraction || a.score || 0))
                    .slice(0, 6);
                colorsHtml = `
                    <div class="analysis-section">
                        <h4>Dominant Colors</h4>
                        <div class="color-container">
                            ${sortedColors.map(colorInfo => {
                                const r = Math.round(colorInfo.color.red || 0);
                                const g = Math.round(colorInfo.color.green || 0);
                                const b = Math.round(colorInfo.color.blue || 0);
                                const pct = colorInfo.pixelFraction ? Math.round(colorInfo.pixelFraction * 100) + '%' : '';
                                const name = _rgbToColorName(r, g, b);
                                return `<div class="color-swatch-wrap" title="${name}${pct ? ' · ' + pct : ''}">
                                    <div class="color-swatch" style="background-color: rgb(${r},${g},${b})"></div>
                                    <span class="color-label">${name}</span>
                                </div>`;
                            }).join('')}
                        </div>
                    </div>
                `;
            }
        }

        // Material & Texture — extracted from Vision labels
        let materialsHtml = '';
        const MATERIAL_KEYWORDS = [
            'leather','fabric','metal','plastic','glass','wood','rubber','denim',
            'cotton','nylon','canvas','velvet','silk','wool','polyester','suede',
            'vinyl','foam','ceramic','paper','cardboard','stone','silver','gold',
            'stainless steel','aluminum','copper','brass','titanium','fur','mesh',
            'woven','knit','lace','synthetic','transparent','opaque','glossy','matte'
        ];
        const materialLabels = (analysisResults.labelAnnotations || [])
            .filter(l => MATERIAL_KEYWORDS.some(kw => l.description.toLowerCase().includes(kw)))
            .map(l => l.description);
        // Also pull high-confidence web entities (brand names)
        const brandEntities = (analysisResults.visionWebEntities || [])
            .filter(e => e.score >= 0.5 && e.description)
            .slice(0, 3)
            .map(e => e.description);
        const detailTags = [...new Set([...materialLabels, ...brandEntities])].slice(0, 6);
        if (detailTags.length > 0) {
            materialsHtml = `
                <div class="analysis-section">
                    <h4>Material & Details</h4>
                    <div class="label-container">
                        ${detailTags.map(tag => `<span class="label">${tag}</span>`).join('')}
                    </div>
                </div>
            `;
        }
        
        // Add the analysis results to the search results element
        const analysisHtml = `
            <div class="analysis-container">
                ${labelsHtml}
                ${colorsHtml}
                ${materialsHtml}
                <div class="analysis-section">
                    <h4>Similar Items</h4>
                </div>
            </div>
        `;
        
        // Render analysis into the dedicated analysis info area
        const analysisInfo = document.getElementById('analysisInfo');
        if (analysisInfo) {
            analysisInfo.innerHTML = analysisHtml;
        } else {
            this.searchResults.innerHTML += analysisHtml;
        }
    }

    displaySearchResults(items, analysisResults) {
        if (!items || items.length === 0) {
            this.searchResults.innerHTML += '<p class="no-results">No matching items found.</p>';
            return;
        }

        // Build a set of query label texts for fast intersection lookup
        const queryLabelTexts = new Set(
            ((analysisResults && analysisResults.labelAnnotations) || [])
                .map(l => l.description.toLowerCase())
        );

        const resultsHTML = items.map(item => {
            // Find which stored Vision labels match the query labels
            let matchedOnHtml = '';
            if (item.visionLabels && item.visionLabels.length > 0) {
                const matched = item.visionLabels
                    .filter(l => queryLabelTexts.has(l.description.toLowerCase()))
                    .slice(0, 4)
                    .map(l => l.description);
                if (matched.length > 0) {
                    matchedOnHtml = `<p class="matched-on">Matched on: ${matched.join(', ')}</p>`;
                }
            }

            return `
            <div class="search-result-item" data-id="${item.id}">
                <div class="result-image">
                    <img src="${item.image}" alt="${item.title}" onerror="this.src='https://via.placeholder.com/100x100?text=No+Image'">
                    ${item.score ? `<div class="match-score">${Math.round(item.score * 100)}% match</div>` : ''}
                </div>
                <div class="result-details">
                    <h4>${item.title || 'Unnamed Item'}</h4>
                    <p>${item.category || 'Uncategorized'}</p>
                    <p>${item.location || 'Unknown location'}</p>
                    ${matchedOnHtml}
                </div>
            </div>`;
        }).join('');

        // Append results (don't replace the whole content to preserve the analysis results)
        const resultsContainer = document.createElement('div');
        resultsContainer.className = 'search-results-list';
        resultsContainer.innerHTML = resultsHTML;
        this.searchResults.appendChild(resultsContainer);

        // Make entire card clickable
        document.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', async () => {
                const itemId = item.dataset.id;
                try {
                    const docRef = firebase.firestore().collection('items').doc(itemId);
                    const doc = await docRef.get();
                    
                    if (doc.exists) {
                        const itemData = {
                            id: doc.id,
                            ...doc.data()
                        };
                        
                        // Close search modal and open item details
                        window.imageSearchModal.close();
                        openItemDetails(itemData);

                        // Wire up Chat with Staff button for this specific item.
                        // Clone the button to strip any stale listeners, then attach a fresh one.
                        const chatBtn = document.getElementById('claimItemBtn');
                        if (chatBtn) {
                            const freshBtn = chatBtn.cloneNode(true);
                            chatBtn.parentNode.replaceChild(freshBtn, chatBtn);
                            freshBtn.addEventListener('click', (e) => {
                                e.stopPropagation();
                                window._returnToImageSearch = false;
                                // Open the floating chat widget with item context (modal stays open)
                                if (typeof window.openUserChat === 'function') {
                                    window.openUserChat(itemData.id, itemData.title);
                                } else {
                                    window.location.href = `item-details.html?id=${itemData.id}`;
                                }
                            });
                        }

                        // When item details modal closes, re-open search modal
                        window._returnToImageSearch = true;
                    } else {
                        console.error('Item not found:', itemId);
                        alert('Item not found');
                    }
                } catch (error) {
                    console.error('Error getting item:', error);
                    alert('Error loading item details');
                }
            });
        });
    }
}

// Add improved CSS styles
function addImprovedSearchStyles() {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        /* Image search modal - auto-size, expands when results appear */
        .image-search-modal-content {
            max-width: 96vw !important;
            width: auto !important;
            min-width: 300px !important;
            max-height: 90vh !important;
            margin: 2vh auto !important;
            overflow-y: auto !important;
        }
        
        .image-search-modal-content.has-results {
            width: 96vw !important;
        }
        
        /* Top row: image preview + analysis side by side */
        .image-search-top {
            display: flex;
            gap: 1.5rem;
            margin-top: 0.5rem;
            flex-shrink: 0;
        }
        
        .image-search-preview {
            flex: 0 0 200px;
        }
        
        .image-search-preview .image-preview {
            height: 150px;
        }
        
        .image-search-preview .upload-actions {
            display: flex;
            gap: 0.5rem;
        }
        
        .image-search-preview .upload-actions .btn {
            flex: 1;
            font-size: 12px;
            padding: 6px 8px;
        }
        
        .analysis-info {
            flex: 1;
            min-width: 0;
        }
        
        /* Override default grid on search-results so it acts as a plain container */
        .image-search-modal-content > .search-results {
            display: block !important;
            margin-top: 0.5rem !important;
        }
        
        .analysis-container {
            background: #f9fafb;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 15px;
        }
        
        .analysis-section {
            margin-bottom: 15px;
        }
        
        .analysis-section h4 {
            margin: 0 0 8px 0;
            font-size: 15px;
            color: #1f2937;
        }
        
        .label-container {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        
        .label {
            background-color: #e0f2fe;
            color: #0369a1;
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 12px;
        }
        
        .color-container {
            display: flex;
            gap: 8px;
        }
        
        .color-swatch-wrap {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
        }

        .color-swatch {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 2px solid #e5e7eb;
            box-shadow: 0 1px 4px rgba(0,0,0,0.15);
        }

        .color-label {
            font-size: 10px;
            color: #6b7280;
            text-align: center;
            max-width: 48px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .search-results-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 1.5rem;
            padding: 0;
            width: 100%;
        }
        
        .search-result-item {
            display: flex;
            flex-direction: column;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            overflow: hidden;
            background: white;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            cursor: pointer;
        }
        
        .search-result-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        
        .result-image {
            position: relative;
            width: 100%;
            height: 180px;
            flex-shrink: 0;
        }
        
        .result-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .match-score {
            position: absolute;
            bottom: 8px;
            left: 8px;
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            font-size: 11px;
            padding: 3px 8px;
            border-radius: 10px;
        }
        
        .result-details {
            padding: 10px 12px;
            flex-grow: 1;
        }
        
        .result-details h4 {
            margin: 0 0 4px 0;
            font-size: 14px;
            color: #1f2937;
        }
        
        .result-details p {
            margin: 0 0 4px 0;
            font-size: 13px;
            color: #6b7280;
        }

        .matched-on {
            font-size: 11px;
            color: #0369a1;
            font-style: italic;
            margin: 4px 0 0 0 !important;
        }

        .vision-warning {
            font-size: 12px;
            color: #92400e;
            background: #fef3c7;
            border: 1px solid #fcd34d;
            padding: 6px 10px;
            border-radius: 6px;
            margin-bottom: 8px;
        }

        .vision-ok {
            font-size: 12px;
            color: #065f46;
            background: #d1fae5;
            border: 1px solid #6ee7b7;
            padding: 6px 10px;
            border-radius: 6px;
            margin-bottom: 8px;
        }

        .search-category-wrap {
            margin-top: 8px;
        }

        .search-category-select {
            width: 100%;
            padding: 6px 8px;
            font-size: 12px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            background: #fff;
            color: #374151;
            cursor: pointer;
        }

        .search-category-select:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 2px rgba(59,130,246,0.15);
        }

        .searching {
            display: flex;
            align-items: center;
            font-style: italic;
            color: #6b7280;
        }
        
        .searching::before {
            content: '';
            display: inline-block;
            width: 16px;
            height: 16px;
            margin-right: 8px;
            border: 2px solid #6b7280;
            border-radius: 50%;
            border-top-color: transparent;
            animation: spin 1s linear infinite;
        }
        
        .error {
            background-color: #fee2e2;
            color: #b91c1c;
            padding: 10px 15px;
            border-radius: 6px;
            margin-bottom: 15px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        /* Responsive fallback for small screens */
        @media (max-width: 640px) {
            .image-search-layout {
                flex-direction: column;
            }
            .image-search-left {
                flex: none;
            }
        }
    `;
    document.head.appendChild(styleEl);
}

// Initialize accurate image search when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing accurate image search');
    
    // Add improved styles
    addImprovedSearchStyles();
    
    // Initialize image search if the elements exist on the page
    if (document.getElementById('imageSearchBtn')) {
        // Initialize the accurate image search
        const accurateSearch = new AccurateImageSearch();
        
        // Add click event to the image search button in the header
        document.getElementById('imageSearchBtn').addEventListener('click', () => {
            // Reset the image search modal
            document.getElementById('imageUpload').value = '';
            document.getElementById('imagePreview').innerHTML = '<p>No image selected</p>';
            document.getElementById('findMatchesBtn').disabled = true;
            document.getElementById('searchResults').innerHTML = '';
            const analysisInfo = document.getElementById('analysisInfo');
            if (analysisInfo) analysisInfo.innerHTML = '';
            const catSel = document.getElementById('searchCategory');
            if (catSel) catSel.value = '';
            document.querySelector('.image-search-modal-content')?.classList.remove('has-results');
            
            // Open the modal
            window.imageSearchModal.open();
        });
    }
});
