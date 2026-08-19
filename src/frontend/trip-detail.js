"use strict";

function formatCents(totalCents) {
  const dollars = Math.floor(totalCents / 100);
  const cents = String(totalCents % 100).padStart(2, "0");
  return `$${dollars}.${cents}`;
}

function getTripId() {
  const match = window.location.pathname.match(/\/trips\/(\d+)/);
  return match ? match[1] : null;
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

async function loadTrip() {
  const tripId = getTripId();
  const response = await fetch(`/api/trips/${tripId}`);
  if (!response.ok) {
    if (response.status === 404) {
      document.body.innerHTML = "<p class='container'>Trip not found.</p>";
    }
    return;
  }
  const data = await response.json();
  renderTrip(data);
}

function renderTrip(data) {
  const trip = data.trip;
  const expenses = data.expenses;
  const totalCents = data.total_cents;

  document.getElementById("trip-name").textContent = trip.name;
  document.getElementById("trip-destination").textContent = trip.destination;
  document.getElementById("trip-dates").textContent = `${trip.start_date} – ${trip.end_date}`;

  renderExpenses(expenses, totalCents);
}

function renderExpenses(expenses, totalCents) {
  const table = document.getElementById("expenses-table");
  const emptyState = document.getElementById("expenses-empty-state");
  const tbody = document.getElementById("expenses-body");
  const totalEl = document.getElementById("total-amount");

  tbody.replaceChildren();
  totalEl.textContent = formatCents(totalCents);

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
      row.className = "expense-over-threshold";
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

    const actionsCell = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteExpense(expense.id));
    actionsCell.appendChild(deleteButton);

    row.append(dateCell, categoryCell, noteCell, amountCell, actionsCell);
    tbody.appendChild(row);
  }
}

async function deleteExpense(expenseId) {
  const response = await fetch(`/api/expenses/${expenseId}`, { method: "DELETE" });
  if (response.ok || response.status === 204) {
    await loadTrip();
  }
}

document.getElementById("add-expense-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();

  const tripId = getTripId();
  const form = event.target;
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
