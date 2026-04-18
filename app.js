const destinationIds = [1, 2, 3, 4];
const mismatchMessage = "Reference grid cannot be matched to the destination type with a valid 6-digit RSO/UTM conversion.";
const modeStorageKey = "gec-calc-mode";
let currentMode = "PCP";

const referenceInputs = {
  easting: document.getElementById("reference-easting"),
  northing: document.getElementById("reference-northing"),
  eastingError: document.getElementById("reference-easting-error"),
  northingError: document.getElementById("reference-northing-error"),
  sectionError: document.getElementById("reference-section-error"),
  typeValue: document.getElementById("reference-type-value"),
  conversionType: document.getElementById("reference-conversion-type"),
  conversionEasting: document.getElementById("reference-conversion-easting"),
  conversionNorthing: document.getElementById("reference-conversion-northing"),
};

const destinationInputs = destinationIds.map((id) => ({
  id,
  card: document.querySelector(`[data-destination-id="${id}"]`),
  easting: document.getElementById(`destination-${id}-easting`),
  northing: document.getElementById(`destination-${id}-northing`),
  error: document.getElementById(`destination-${id}-error`),
  preview: document.getElementById(`destination-${id}-preview`),
}));

const resultsList = document.getElementById("results-list");
const resultsEmpty = document.getElementById("results-empty");
const calculateButton = document.getElementById("calculate-button");
const resetButton = document.getElementById("reset-button");
const modeToggle = document.getElementById("mode-toggle");
const themeToggle = document.getElementById("theme-toggle");
const themeStorageKey = "gec-calc-theme";

function getActiveDestinationCount() {
  return currentMode === "BCP" ? 4 : 3;
}

function getActiveDestinationInputs() {
  return destinationInputs.slice(0, getActiveDestinationCount());
}

function isDigitsOnly(value) {
  return /^\d+$/.test(value);
}

function normalizeDestinationEasting(value) {
  if (value.length === 4) {
    return `6${value}0`;
  }

  if (value.length === 6) {
    return value;
  }

  return null;
}

function normalizeDestinationNorthing(value) {
  if (value.length === 4) {
    return `1${value}0`;
  }

  if (value.length === 6) {
    return value;
  }

  return null;
}

function detectGridType(easting) {
  const normalized = String(easting);
  const leadingDigit = normalized.charAt(0);

  if (leadingDigit === "6") {
    return "RSO";
  }

  if (leadingDigit === "3") {
    return "UTM";
  }

  return null;
}

function isSixDigitGridValue(value) {
  return Number.isInteger(value) && value >= 0 && String(value).length === 6;
}

function formatGridCoordinate(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const absoluteValue = Math.abs(Math.trunc(value)).toString().padStart(6, "0");
  return value < 0 ? `-${absoluteValue}` : absoluteValue;
}

function convertReferenceGrid(reference) {
  if (!reference.type || reference.normalizedEasting === null || reference.normalizedNorthing === null) {
    return null;
  }

  let converted = null;

  if (reference.type === "RSO") {
    converted = {
      type: "UTM",
      easting: reference.normalizedEasting - 278543,
      northing: reference.normalizedNorthing - 37,
    };
  }

  if (reference.type === "UTM") {
    converted = {
      type: "RSO",
      easting: reference.normalizedEasting + 278543,
      northing: reference.normalizedNorthing + 37,
    };
  }

  if (!converted) {
    return null;
  }

  return {
    ...converted,
    isValid: (
      isSixDigitGridValue(converted.easting)
      && isSixDigitGridValue(converted.northing)
      && detectGridType(converted.easting) === converted.type
    ),
  };
}

function validateReferenceGrid(easting, northing) {
  const errors = [];
  const fieldErrors = {
    easting: "",
    northing: "",
  };

  const reference = {
    rawEasting: easting,
    rawNorthing: northing,
    normalizedEasting: null,
    normalizedNorthing: null,
    type: null,
    errors,
    fieldErrors,
  };

  if (!easting) {
    fieldErrors.easting = "Reference easting is required.";
  } else if (!isDigitsOnly(easting)) {
    fieldErrors.easting = "Reference easting must contain digits only.";
  } else if (easting.length !== 6) {
    fieldErrors.easting = "Reference easting must be 6 digits.";
  }

  if (!northing) {
    fieldErrors.northing = "Reference northing is required.";
  } else if (!isDigitsOnly(northing)) {
    fieldErrors.northing = "Reference northing must contain digits only.";
  } else if (northing.length !== 6) {
    fieldErrors.northing = "Reference northing must be 6 digits.";
  }

  if (fieldErrors.easting) {
    errors.push(fieldErrors.easting);
  }

  if (fieldErrors.northing) {
    errors.push(fieldErrors.northing);
  }

  if (errors.length === 0) {
    reference.normalizedEasting = Number(easting);
    reference.normalizedNorthing = Number(northing);
    reference.type = detectGridType(easting);

    if (!reference.type) {
      const message = "Reference grid type is unknown. Easting must start with 6 for RSO or 3 for UTM.";
      errors.push(message);
    }
  }

  return reference;
}

function validateAndNormalizeDestinationGrid(id, easting, northing) {
  const errors = [];
  const trimmedEasting = easting.trim();
  const trimmedNorthing = northing.trim();
  const isBlankRow = trimmedEasting === "" && trimmedNorthing === "";

  const destination = {
    id,
    rawEasting: trimmedEasting,
    rawNorthing: trimmedNorthing,
    normalizedEasting: null,
    normalizedNorthing: null,
    type: null,
    dE: null,
    dN: null,
    distance: null,
    angleDeg: null,
    angleMil: null,
    errors,
    status: isBlankRow ? "blank" : "pending",
    note: "",
  };

  if (isBlankRow) {
    return destination;
  }

  if (trimmedEasting === "" || trimmedNorthing === "") {
    errors.push("Both easting and northing are required for this destination.");
    destination.status = "invalid";
    return destination;
  }

  if (!isDigitsOnly(trimmedEasting) || !isDigitsOnly(trimmedNorthing)) {
    errors.push("Destination easting and northing must contain digits only.");
  }

  if (![4, 6].includes(trimmedEasting.length)) {
    errors.push("Destination easting must be 4 digits or 6 digits.");
  }

  if (![4, 6].includes(trimmedNorthing.length)) {
    errors.push("Destination northing must be 4 digits or 6 digits.");
  }

  if (errors.length > 0) {
    destination.status = "invalid";
    return destination;
  }

  const normalizedEasting = normalizeDestinationEasting(trimmedEasting);
  const normalizedNorthing = normalizeDestinationNorthing(trimmedNorthing);

  if (!normalizedEasting || !normalizedNorthing) {
    errors.push("Destination grid could not be normalized.");
    destination.status = "invalid";
    return destination;
  }

  destination.normalizedEasting = Number(normalizedEasting);
  destination.normalizedNorthing = Number(normalizedNorthing);
  destination.type = detectGridType(normalizedEasting);

  if (!destination.type) {
    errors.push("Destination grid type is unknown after normalization.");
    destination.status = "invalid";
    return destination;
  }

  destination.status = "valid";
  return destination;
}

function calculateDelta(destination, reference) {
  return {
    dE: destination.normalizedEasting - reference.normalizedEasting,
    dN: destination.normalizedNorthing - reference.normalizedNorthing,
  };
}

function calculateDistance(dE, dN) {
  return Math.sqrt((dE ** 2) + (dN ** 2));
}

function calculateAngleDegrees(dE, dN) {
  return (Math.atan2(dE, dN) * 180 / Math.PI + 360) % 360;
}

function convertDegreesToMils(angleDeg) {
  return angleDeg * 17.78;
}

function resolveReferenceForDestination(destination, reference) {
  if (!reference.type) {
    return null;
  }

  if (destination.type === reference.type) {
    return {
      normalizedEasting: reference.normalizedEasting,
      normalizedNorthing: reference.normalizedNorthing,
      type: reference.type,
      wasConverted: false,
    };
  }

  const convertedReference = convertReferenceGrid(reference);
  if (convertedReference?.isValid && convertedReference.type === destination.type) {
    return {
      normalizedEasting: convertedReference.easting,
      normalizedNorthing: convertedReference.northing,
      type: convertedReference.type,
      wasConverted: true,
    };
  }

  return null;
}

function processDestination(destination, reference) {
  if (destination.status === "blank" || destination.errors.length > 0) {
    return destination;
  }

  const effectiveReference = resolveReferenceForDestination(destination, reference);
  if (!effectiveReference) {
    destination.errors.push(mismatchMessage);
    destination.status = "invalid";
    return destination;
  }

  destination.referenceTypeUsed = effectiveReference.type;
  if (effectiveReference.wasConverted) {
    destination.note = `Calculated using reference converted from ${reference.type} to ${effectiveReference.type}.`;
  }

  const { dE, dN } = calculateDelta(destination, effectiveReference);
  destination.dE = dE;
  destination.dN = dN;
  destination.distance = calculateDistance(dE, dN);

  if (dE === 0 && dN === 0) {
    destination.angleDeg = 0;
    destination.angleMil = 0;
    destination.note = effectiveReference.wasConverted
      ? `${destination.note} Destination equals reference.`
      : "Destination equals reference.";
    destination.status = "same-location";
    return destination;
  }

  destination.angleDeg = calculateAngleDegrees(dE, dN);
  destination.angleMil = convertDegreesToMils(destination.angleDeg);
  destination.status = "calculated";

  return destination;
}

function formatNumber(value) {
  return value.toFixed(2);
}

function formatDistance(value) {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)}m`;
}

function setFieldState(input, messageElement, message) {
  input.classList.toggle("input-invalid", Boolean(message));
  messageElement.textContent = message || "";
}

function renderReferenceValidation(reference) {
  setFieldState(referenceInputs.easting, referenceInputs.eastingError, reference.fieldErrors.easting);
  setFieldState(referenceInputs.northing, referenceInputs.northingError, reference.fieldErrors.northing);

  referenceInputs.sectionError.textContent = reference.errors.find(
    (error) => error.includes("grid type is unknown"),
  ) || "";

  referenceInputs.typeValue.textContent = reference.type ? reference.type : "Awaiting valid input";

  const convertedReference = convertReferenceGrid(reference);
  if (convertedReference?.isValid) {
    referenceInputs.conversionType.textContent = `${reference.type} -> ${convertedReference.type}`;
    referenceInputs.conversionEasting.textContent = formatGridCoordinate(convertedReference.easting);
    referenceInputs.conversionNorthing.textContent = formatGridCoordinate(convertedReference.northing);
  } else if (convertedReference) {
    referenceInputs.conversionType.textContent = `${reference.type} -> ${convertedReference.type} unavailable`;
    referenceInputs.conversionEasting.textContent = formatGridCoordinate(convertedReference.easting);
    referenceInputs.conversionNorthing.textContent = formatGridCoordinate(convertedReference.northing);
  } else {
    referenceInputs.conversionType.textContent = "Awaiting valid reference grid";
    referenceInputs.conversionEasting.textContent = "-";
    referenceInputs.conversionNorthing.textContent = "-";
  }
}

function buildDestinationPreview(destination) {
  if (destination.status === "blank") {
    return "Leave blank to ignore this row.";
  }

  if (destination.errors.length > 0) {
    return "Fix the row-level error below to include this destination.";
  }

  return `Normalized: ${destination.normalizedEasting} / ${destination.normalizedNorthing} | Type: ${destination.type}`;
}

function renderDestinationValidation(destination) {
  const row = destinationInputs.find((item) => item.id === destination.id);

  row.card.classList.remove("has-error", "has-success");
  row.error.textContent = destination.errors.join(" ");
  row.preview.textContent = buildDestinationPreview(destination);

  if (destination.errors.length > 0) {
    row.card.classList.add("has-error");
  } else if (destination.status !== "blank") {
    row.card.classList.add("has-success");
  }
}

function resetDestinationRow(row) {
  row.easting.value = "";
  row.northing.value = "";
  row.card.classList.remove("has-error", "has-success");
  row.error.textContent = "";
  row.preview.textContent = "Leave blank to ignore this row.";
}

function clearResults() {
  resultsList.innerHTML = "";
  resultsEmpty.hidden = false;
}

function renderResults(results, reference) {
  clearResults();

  if (results.length === 0) {
    return;
  }

  resultsEmpty.hidden = true;

  const markup = results.map((result) => {
    const blockedByReference = reference.errors.length > 0 && result.errors.length === 0;
    const isCalculated = result.errors.length === 0 && !blockedByReference;
    const statusClass = isCalculated ? "success" : "error";
    const statusText = blockedByReference
      ? "Reference grid must be fixed first"
      : isCalculated
        ? "Calculation complete"
        : "Needs attention";
    const resultClass = isCalculated ? "result-success" : "result-error";

    const summaryMetrics = [
      ["Distance (meters)", typeof result.distance === "number" ? formatDistance(result.distance) : "—"],
      ["Angle (mils)", typeof result.angleMil === "number" ? formatNumber(result.angleMil) : "—"],
    ];

    const detailMetrics = [
      ["Raw Easting", result.rawEasting || "—"],
      ["Raw Northing", result.rawNorthing || "—"],
      ["Normalized Easting", result.normalizedEasting ?? "—"],
      ["Normalized Northing", result.normalizedNorthing ?? "—"],
      ["Destination Type", result.type || "—"],
      ["Reference Type", result.referenceTypeUsed || reference.type || "—"],
      ["dE", result.dE ?? "—"],
      ["dN", result.dN ?? "—"],
      ["Angle (deg)", typeof result.angleDeg === "number" ? formatNumber(result.angleDeg) : "—"],
    ];

    const summaryMarkup = summaryMetrics.map(([label, value]) => `
      <div class="result-item">
        <dt>${label}</dt>
        <dd>${value}</dd>
      </div>
    `).join("");

    const detailMarkup = detailMetrics.map(([label, value]) => `
      <div class="result-item">
        <dt>${label}</dt>
        <dd>${value}</dd>
      </div>
    `).join("");

    return `
      <article class="result-card ${resultClass}">
        <p class="result-status ${statusClass}">${statusText}</p>
        <h3>Destination ${result.id}</h3>
        <dl class="result-summary">${summaryMarkup}</dl>
        <details class="result-details">
          <summary>Show details</summary>
          <dl class="result-grid">${detailMarkup}</dl>
        </details>
        ${blockedByReference ? '<p class="result-note">Reference validation failed, so this row was not calculated.</p>' : ""}
        ${result.note ? `<p class="result-note">${result.note}</p>` : ""}
        ${result.errors.length > 0 ? `<p class="result-errors">${result.errors.join(" ")}</p>` : ""}
      </article>
    `;
  }).join("");

  resultsList.innerHTML = markup;
}

function getReferenceInputValues() {
  return {
    easting: referenceInputs.easting.value.trim(),
    northing: referenceInputs.northing.value.trim(),
  };
}

function getDestinationInputValues() {
  return getActiveDestinationInputs().map((row) => ({
    id: row.id,
    easting: row.easting.value.trim(),
    northing: row.northing.value.trim(),
  }));
}

function updateLiveReferenceType() {
  const { easting, northing } = getReferenceInputValues();
  const reference = validateReferenceGrid(easting, northing);
  renderReferenceValidation(reference);
}

function updateLiveDestinationPreview(id) {
  const row = destinationInputs.find((item) => item.id === id);
  const destination = validateAndNormalizeDestinationGrid(id, row.easting.value, row.northing.value);
  renderDestinationValidation(destination);
}

function resetDestinationStates() {
  destinationInputs.forEach((row) => {
    row.card.classList.remove("has-error", "has-success");
    row.error.textContent = "";
    row.preview.textContent = "Leave blank to ignore this row.";
  });
}

function resetForm() {
  destinationInputs.forEach((row) => {
    resetDestinationRow(row);
  });

  resetDestinationStates();
  clearResults();

  const referenceValues = getReferenceInputValues();
  const reference = validateReferenceGrid(referenceValues.easting, referenceValues.northing);
  renderReferenceValidation(reference);
}

function applyMode(mode) {
  currentMode = mode === "BCP" ? "BCP" : "PCP";
  const isBcp = currentMode === "BCP";
  modeToggle.setAttribute("aria-pressed", String(isBcp));
  modeToggle.setAttribute("aria-label", isBcp ? "BCP mode selected" : "PCP mode selected");
  modeToggle.setAttribute("title", isBcp ? "BCP mode selected" : "PCP mode selected");

  destinationInputs.forEach((row) => {
    const isActive = row.id <= getActiveDestinationCount();
    row.card.classList.toggle("is-hidden", !isActive);

    if (!isActive) {
      resetDestinationRow(row);
    }
  });

  clearResults();
}

function toggleMode() {
  const nextMode = currentMode === "PCP" ? "BCP" : "PCP";
  applyMode(nextMode);
  window.localStorage.setItem(modeStorageKey, nextMode);
}

function initializeMode() {
  applyMode(window.localStorage.getItem(modeStorageKey) || "PCP");
}

function applyTheme(theme) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.body.setAttribute("data-theme", nextTheme);
  themeToggle.setAttribute("aria-pressed", String(nextTheme === "dark"));
  themeToggle.setAttribute("aria-label", nextTheme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  themeToggle.setAttribute("title", nextTheme === "dark" ? "Switch to light mode" : "Switch to dark mode");
}

function toggleTheme() {
  const currentTheme = document.body.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  window.localStorage.setItem(themeStorageKey, nextTheme);
}

function initializeTheme() {
  const storedTheme = window.localStorage.getItem(themeStorageKey);
  const preferredDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(storedTheme || (preferredDark ? "dark" : "light"));
}

function handleCalculate() {
  const referenceValues = getReferenceInputValues();
  const reference = validateReferenceGrid(referenceValues.easting, referenceValues.northing);
  renderReferenceValidation(reference);

  const destinationResults = getDestinationInputValues()
    .map((destination) => validateAndNormalizeDestinationGrid(destination.id, destination.easting, destination.northing))
    .filter((destination) => destination.status !== "blank")
    .map((destination) => (reference.errors.length === 0 ? processDestination(destination, reference) : destination));

  destinationResults.forEach(renderDestinationValidation);

  if (reference.errors.length > 0) {
    renderResults(destinationResults, reference);
    return;
  }

  renderResults(destinationResults, reference);
}

calculateButton.addEventListener("click", handleCalculate);
resetButton.addEventListener("click", resetForm);
modeToggle.addEventListener("click", toggleMode);
themeToggle.addEventListener("click", toggleTheme);

referenceInputs.easting.addEventListener("input", updateLiveReferenceType);
referenceInputs.northing.addEventListener("input", updateLiveReferenceType);

destinationInputs.forEach((row) => {
  row.easting.addEventListener("input", () => updateLiveDestinationPreview(row.id));
  row.northing.addEventListener("input", () => updateLiveDestinationPreview(row.id));
});

initializeMode();
initializeTheme();
resetDestinationStates();
