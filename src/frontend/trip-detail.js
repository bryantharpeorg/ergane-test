"use strict";

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
}

function renderTrip(data) {
  const trip = data.trip;
  const expenses = data.expenses || [];
  const totalCents = data.total_cents;
  const subtotals = data.subtotals || [];

  document.getElementById("trip-name").textContent = trip.name;
  document.getElementById("trip-meta").textContent = `${trip.destination} · ${formatRange(trip.start_date, trip.end_date)}`;
  document.getElementById("trip-total").textContent = formatCents(totalCents);

  renderExpenses(expenses);
  renderSubtotals(subtotals);
  renderChart(subtotals);
  renderCategoryFilter();
}

function renderSubtotals(subtotals) {
  const list = document.getElementById("subtotals-list");
  list.replaceChildren();

  if (subtotals.length === 0) {
    list.textContent = "No expenses yet.";
    return;
  }

  for (const { category, subtotal_cents } of subtotals) {
    const row = document.createElement("div");
    row.className = "subtotal-row";

    const label = document.createElement("span");
    label.className = "subtotal-label";
    label.textContent = category;

    const value = document.createElement("span");
    value.className = "subtotal-value";
    value.textContent = formatCents(subtotal_cents);

    row.append(label, value);
    list.appendChild(row);
  }
}

function renderChart(subtotals) {
  const container = document.getElementById("chart-container");
  container.replaceChildren();

  if (subtotals.length === 0) {
    container.textContent = "No data to chart.";
    return;
  }

  const maxCents = Math.max(...subtotals.map((s) => s.subtotal_cents));

  for (const { category, subtotal_cents } of subtotals) {
    const row = document.createElement("div");
    row.className = "chart-row";

    const label = document.createElement("span");
    label.className = "chart-label";
    label.textContent = category;

    const track = document.createElement("div");
    track.className = "chart-track";

    const fill = document.createElement("div");
    fill.className = "chart-fill";
    fill.style.width = `${(subtotal_cents / maxCents) * 100}%`;

    const value = document.createElement("span");
    value.className = "chart-value";
    value.textContent = formatCents(subtotal_cents);

    track.appendChild(fill);
    row.append(label, track, value);
    container.appendChild(row);
  }
}

function renderCategoryFilter() {
  const container = document.getElementById("category-filter");
  container.replaceChildren();

  const select = document.createElement("select");
  select.id = "filter-category";
  select.name = "filter-category";

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All categories";
  select.appendChild(allOption);

  const categories = ["Lodging", "Food", "Transport", "Gear", "Fees", "Other"];
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  }

  select.addEventListener("change", async () => {
    const tripId = getTripId();
    const category = select.value;
    const url = category
      ? `/api/trips/${tripId}/expenses?category=${encodeURIComponent(category)}`
      : `/api/trips/${tripId}/expenses`;
    const response = await fetch(url);
    if (response.ok) {
      renderExpenses(await response.json());
    }
  });

  container.appendChild(select);
}

function renderImportResult(result) {
  const container = document.getElementById("import-result");
  container.replaceChildren();
  container.hidden = false;

  const summary = document.createElement("p");
  summary.textContent = `Added ${result.added}, skipped ${result.skipped}`;
  container.appendChild(summary);

  if (result.skipped > 0 && Array.isArray(result.skipped_details)) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = "Show details";
    toggle.className = "import-toggle";

    const detailsList = document.createElement("ul");
    detailsList.className = "import-details";
    detailsList.hidden = true;

    for (const detail of result.skipped_details) {
      const item = document.createElement("li");
      item.textContent = `Line ${detail.line}: ${detail.reason}`;
      detailsList.appendChild(item);
    }

    toggle.addEventListener("click", () => {
      detailsList.hidden = !detailsList.hidden;
      toggle.textContent = detailsList.hidden ? "Show details" : "Hide details";
    });

    container.appendChild(toggle);
    container.appendChild(detailsList);
  }
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
    await loadTrip();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  loadTrip();

  document.getElementById("export-btn").addEventListener("click", () => {
    window.location.href = `/api/trips/${getTripId()}/export.csv`;
  });

  const importForm = document.getElementById("import-form");
  importForm.innerHTML = `
    <form id="import-csv-form">
      <label for="import-csv">Paste CSV rows (date, amount, category, note)</label>
      <textarea id="import-csv" name="import-csv" rows="8" required placeholder="2026-08-05,12.50,Food,Lunch"></textarea>
      <button type="submit">Import</button>
      <div id="import-result" hidden></div>
    </form>
  `;

  document.getElementById("import-csv-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const csv = document.getElementById("import-csv").value;
    const tripId = getTripId();

    const response = await fetch(`/api/trips/${tripId}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });

    if (response.ok) {
      const result = await response.json();
      renderImportResult(result);
      document.getElementById("import-csv").value = "";
      await loadTrip();
    }
  });
});
