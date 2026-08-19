"use strict";

const CATEGORIES = ["Lodging", "Food", "Transport", "Gear", "Fees", "Other"];

let currentFilter = null;

function formatCents(totalCents) {
  const dollars = Math.floor(totalCents / 100);
  const cents = String(totalCents % 100).padStart(2, "0");
  return `$${dollars}.${cents}`;
}

function formatRange(startDate, endDate) {
  return `${startDate} – ${endDate}`;
}

function getTripId() {
  const match = window.location.pathname.match(/\/trips\/(\d+)\/?$/);
  return match ? Number(match[1]) : null;
}

async function loadTrip() {
  const tripId = getTripId();
  if (!tripId) {
    document.body.innerHTML = "<p>Trip not found.</p>";
    return;
  }

  const response = await fetch(`/api/trips/${tripId}`);
  if (response.status === 404) {
    document.body.innerHTML = "<p>Trip not found.</p>";
    return;
  }

  const data = await response.json();
  renderTrip(data);
  await loadFilteredExpenses();
}

async function loadFilteredExpenses() {
  const tripId = getTripId();
  if (!tripId) return;

  const url = currentFilter
    ? `/api/trips/${tripId}/expenses?category=${encodeURIComponent(currentFilter)}`
    : `/api/trips/${tripId}/expenses`;

  const response = await fetch(url);
  if (!response.ok) {
    return;
  }

  const expenses = await response.json();
  renderExpenses(expenses);
}

function renderTrip(data) {
  const trip = data.trip;
  const subtotals = data.subtotals || [];
  const totalCents = data.total_cents;

  document.getElementById("trip-name").textContent = trip.name;
  document.getElementById("trip-meta").textContent = `${trip.destination} · ${formatRange(trip.start_date, trip.end_date)}`;
  document.getElementById("trip-total").textContent = formatCents(totalCents);

  renderSubtotals(subtotals);
  renderChart(subtotals);
  renderFilterControl();
}

function renderFilterControl() {
  const container = document.getElementById("category-filter");
  const existing = container.querySelector("select");
  if (existing) return;

  const select = document.createElement("select");
  select.id = "category-filter-select";

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All categories";
  select.appendChild(allOption);

  for (const category of CATEGORIES) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  }

  select.addEventListener("change", async () => {
    const value = select.value;
    currentFilter = value || null;
    await loadFilteredExpenses();
  });

  container.replaceChildren(select);
}

function renderSubtotals(subtotals) {
  const container = document.getElementById("subtotals-list");
  container.replaceChildren();

  if (subtotals.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No spending recorded yet.";
    container.appendChild(empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "subtotals-list";
  for (const item of subtotals) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.className = "subtotal-category";
    label.textContent = item.category;
    const value = document.createElement("span");
    value.className = "subtotal-value";
    value.textContent = formatCents(item.subtotal_cents);
    li.append(label, value);
    list.appendChild(li);
  }
  container.appendChild(list);
}

function renderChart(subtotals) {
  const container = document.getElementById("chart-container");
  container.replaceChildren();

  if (subtotals.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No data to chart yet.";
    container.appendChild(empty);
    return;
  }

  const maxSubtotal = Math.max(...subtotals.map((item) => item.subtotal_cents));
  const chart = document.createElement("div");
  chart.className = "bar-chart";

  for (const item of subtotals) {
    const row = document.createElement("div");
    row.className = "bar-row";

    const label = document.createElement("div");
    label.className = "bar-label";
    label.textContent = item.category;

    const track = document.createElement("div");
    track.className = "bar-track";

    const fill = document.createElement("div");
    fill.className = "bar-fill";
    const widthPercent = (item.subtotal_cents / maxSubtotal) * 100;
    fill.style.width = `${widthPercent}%`;

    const value = document.createElement("div");
    value.className = "bar-value";
    value.textContent = formatCents(item.subtotal_cents);

    track.appendChild(fill);
    row.append(label, track, value);
    chart.appendChild(row);
  }

  container.appendChild(chart);
}

function renderExpenses(expenses) {
  const table = document.getElementById("expenses-table");
  const emptyState = document.getElementById("empty-state");
  const tbody = document.getElementById("expenses-body");

  tbody.replaceChildren();

  if (expenses.length === 0) {
    table.hidden = true;
    emptyState.hidden = false;
    return;
  }

  table.hidden = false;
  emptyState.hidden = true;

  for (const expense of expenses) {
    const row = document.createElement("tr");
    if (expense.amount_cents > 20000) {
      row.classList.add("expense-over-threshold");
    }

    const dateCell = document.createElement("td");
    dateCell.textContent = expense.date;

    const categoryCell = document.createElement("td");
    categoryCell.textContent = expense.category;

    const noteCell = document.createElement("td");
    noteCell.textContent = expense.note;

    const amountCell = document.createElement("td");
    amountCell.className = "numeric";
    amountCell.textContent = formatCents(expense.amount_cents);

    const actionCell = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteExpense(expense.id));
    actionCell.appendChild(deleteButton);

    row.append(dateCell, categoryCell, noteCell, amountCell, actionCell);
    tbody.appendChild(row);
  }
}

function clearErrors() {
  for (const el of document.querySelectorAll(".error")) {
    el.textContent = "";
  }
}

function showErrors(errors) {
  for (const [field, message] of Object.entries(errors)) {
    const el = document.getElementById(`error-${field}`);
    if (el) {
      el.textContent = message;
    }
  }
}

async function deleteExpense(expenseId) {
  const response = await fetch(`/api/expenses/${expenseId}`, { method: "DELETE" });
  if (response.ok) {
    await loadTrip();
  }
}

document.getElementById("add-expense-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();

  const form = event.target;
  const tripId = getTripId();
  const payload = {
    date: form.elements.date.value,
    amount: form.elements.amount.value,
    category: form.elements.category.value,
    note: form.elements.note.value,
  };

  const response = await fetch(`/api/trips/${tripId}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (response.status === 422) {
    const data = await response.json();
    showErrors(data.errors || {});
    return;
  }

  if (response.ok) {
    form.reset();
    // Preserve the current category filter while refreshing everything else.
    await loadTrip();
  }
});

function renderImportForm() {
  const container = document.getElementById("import-form");
  container.replaceChildren();

  const textarea = document.createElement("textarea");
  textarea.id = "import-csv";
  textarea.rows = 6;
  textarea.placeholder = "Paste CSV rows: date, amount, category, note";
  textarea.style.width = "100%";

  const submitButton = document.createElement("button");
  submitButton.id = "import-submit";
  submitButton.textContent = "Import";

  const resultArea = document.createElement("div");
  resultArea.id = "import-result";
  resultArea.className = "import-result";

  const detailsArea = document.createElement("details");
  detailsArea.id = "import-details";
  const summary = document.createElement("summary");
  summary.textContent = "Skipped row details";
  detailsArea.appendChild(summary);
  const detailsList = document.createElement("ul");
  detailsList.id = "import-details-list";
  detailsArea.appendChild(detailsList);

  submitButton.addEventListener("click", async () => {
    resultArea.textContent = "";
    detailsArea.open = false;
    detailsList.replaceChildren();

    const tripId = getTripId();
    const response = await fetch(`/api/trips/${tripId}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: textarea.value }),
    });

    if (!response.ok) {
      const data = await response.json();
      resultArea.textContent = data.errors?.csv || "Import failed.";
      resultArea.className = "import-result import-error";
      return;
    }

    const data = await response.json();
    resultArea.textContent = `Added ${data.added}, skipped ${data.skipped}`;
    resultArea.className = "import-result";

    if (data.skipped > 0 && data.skipped_details?.length) {
      for (const detail of data.skipped_details) {
        const li = document.createElement("li");
        li.textContent = `Line ${detail.line}: ${detail.reason}`;
        detailsList.appendChild(li);
      }
      detailsArea.open = true;
    }

    textarea.value = "";
    await loadTrip();
  });

  container.append(textarea, submitButton, resultArea, detailsArea);
}

document.getElementById("export-btn").addEventListener("click", () => {
  const tripId = getTripId();
  window.location.href = `/api/trips/${tripId}/export.csv`;
});

document.addEventListener("DOMContentLoaded", () => {
  loadTrip();
  renderImportForm();
});
