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
  const subtotals = data.subtotals || [];
  const totalCents = data.total_cents;

  document.getElementById("trip-name").textContent = trip.name;
  document.getElementById("trip-meta").textContent = `${trip.destination} · ${formatRange(trip.start_date, trip.end_date)}`;
  document.getElementById("trip-total").textContent = formatCents(totalCents);

  renderSubtotals(subtotals);
  renderChart(subtotals);
  renderExpenses(expenses);
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
    await loadTrip();
  }
});

document.addEventListener("DOMContentLoaded", loadTrip);
