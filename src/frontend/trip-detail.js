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

  document.getElementById("trip-name").textContent = trip.name;
  document.getElementById("trip-meta").textContent = `${trip.destination} · ${formatRange(trip.start_date, trip.end_date)}`;
  document.getElementById("trip-total").textContent = formatCents(totalCents);

  renderExpenses(expenses);
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
