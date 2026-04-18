const destinationIds = [1, 2, 3];
const mismatchMessage = "Grid type mismatch: destination and reference must both be RSO or both be UTM.";

const referenceInputs = {
  easting: document.getElementById("reference-easting"),
  northing: document.getElementById("reference-northing"),
  eastingError: document.getElementById("reference-easting-error"),
  northingError: document.getElementById("reference-northing-error"),
  sectionError: document.getElementById("reference-section-error"),
  typeValue: document.getElementById("reference-type-value"),
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
const themeToggle = document.getElementById("theme-toggle");
const themeStorageKey = "gec-calc-theme";

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

function processDestination(destination, reference) {
  if (destination.status === "blank" || destination.errors.length > 0) {
    return destination;
  }

  if (!reference.type || destination.type !== reference.type) {
    destination.errors.push(mismatchMessage);
    destination.status = "invalid";
    return destination;
  }

  const { dE, dN } = calculateDelta(destination, reference);
  destination.dE = dE;
  destination.dN = dN;
  destination.distance = calculateDistance(dE, dN);

  if (dE === 0 && dN === 0) {
    destination.angleDeg = 0;
    destination.angleMil = 0;
    destination.note = "Destination equals reference.";
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
      ["Reference Type", reference.type || "—"],
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
  return destinationInputs.map((row) => ({
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
  referenceInputs.easting.value = "";
  referenceInputs.northing.value = "";
  referenceInputs.typeValue.textContent = "Awaiting valid input";
  referenceInputs.easting.classList.remove("input-invalid");
  referenceInputs.northing.classList.remove("input-invalid");
  referenceInputs.eastingError.textContent = "";
  referenceInputs.northingError.textContent = "";
  referenceInputs.sectionError.textContent = "";

  destinationInputs.forEach((row) => {
    row.easting.value = "";
    row.northing.value = "";
  });

  resetDestinationStates();
  clearResults();
}

function applyTheme(theme) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.body.setAttribute("data-theme", nextTheme);
  themeToggle.textContent = nextTheme === "dark" ? "Light mode" : "Dark mode";
  themeToggle.setAttribute("aria-pressed", String(nextTheme === "dark"));
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
themeToggle.addEventListener("click", toggleTheme);

referenceInputs.easting.addEventListener("input", updateLiveReferenceType);
referenceInputs.northing.addEventListener("input", updateLiveReferenceType);

destinationInputs.forEach((row) => {
  row.easting.addEventListener("input", () => updateLiveDestinationPreview(row.id));
  row.northing.addEventListener("input", () => updateLiveDestinationPreview(row.id));
});

initializeTheme();
resetDestinationStates();
