"use strict";

function formatCents(totalCents) {
  const dollars = Math.floor(totalCents / 100);
  const cents = String(totalCents % 100).padStart(2, "0");
  return `$${dollars}.${cents}`;
}

function formatRange(startDate, endDate) {
  return `${startDate} – ${endDate}`;
}

async function loadTrips() {
  const response = await fetch("/api/trips");
  const trips = await response.json();
  renderTrips(trips);
}

function renderTrips(trips) {
  const table = document.getElementById("trips-table");
  const emptyState = document.getElementById("empty-state");
  const tbody = document.getElementById("trips-body");
  const thead = table.querySelector("thead tr");

  tbody.replaceChildren();

  if (trips.length === 0) {
    table.hidden = true;
    emptyState.hidden = false;
    return;
  }

  table.hidden = false;
  emptyState.hidden = true;

  thead.replaceChildren();
  const headers = ["Name", "Destination", "Dates", "Total spent", ""];
  for (const text of headers) {
    const th = document.createElement("th");
    th.textContent = text;
    if (text === "Total spent") {
      th.className = "numeric";
    }
    thead.appendChild(th);
  }

  for (const trip of trips) {
    const row = document.createElement("tr");
    row.addEventListener("click", () => {
      window.location.href = `/trips/${trip.id}`;
    });

    const nameCell = document.createElement("td");
    nameCell.textContent = trip.name;

    const destinationCell = document.createElement("td");
    destinationCell.textContent = trip.destination;

    const datesCell = document.createElement("td");
    datesCell.textContent = formatRange(trip.start_date, trip.end_date);

    const totalCell = document.createElement("td");
    totalCell.className = "numeric";
    totalCell.textContent = formatCents(trip.total_cents);

    const actionCell = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", async (event) => {
      event.stopPropagation();

      let message;
      try {
        const expensesResponse = await fetch(`/api/trips/${trip.id}/expenses`);
        if (expensesResponse.ok) {
          const expenses = await expensesResponse.json();
          if (expenses.length === 0) {
            message = `Delete ${trip.name}? It has no expenses.\n\nThis cannot be undone.`;
          } else {
            const lines = expenses.map((expense) => {
              const label = expense.note.trim() || expense.category;
              return `  • ${label}: ${formatCents(expense.amount_cents)}`;
            }).join("\n");
            message = `Delete ${trip.name} and the following expenses?\n${lines}\n\nThis cannot be undone.`;
          }
        } else {
          message = `Delete ${trip.name} and all its expenses? This cannot be undone.`;
        }
      } catch {
        message = `Delete ${trip.name} and all its expenses? This cannot be undone.`;
      }

      if (!confirm(message)) {
        return;
      }

      const response = await fetch(`/api/trips/${trip.id}`, { method: "DELETE" });
      if (response.ok) {
        await loadTrips();
      }
    });
    actionCell.appendChild(deleteButton);

    row.append(nameCell, destinationCell, datesCell, totalCell, actionCell);
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

document.getElementById("create-trip-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();

  const form = event.target;
  const payload = {
    name: form.elements.name.value,
    destination: form.elements.destination.value,
    start_date: form.elements.start_date.value,
    end_date: form.elements.end_date.value,
  };

  const response = await fetch("/api/trips", {
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
    await loadTrips();
  }
});

document.addEventListener("DOMContentLoaded", loadTrips);
