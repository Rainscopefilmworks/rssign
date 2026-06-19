const customerForm = document.querySelector("#customer-form");
const customersEl = document.querySelector("#customers");
const detailsEl = document.querySelector("#customer-details");
const selectedLabel = document.querySelector("#selected-label");
const searchInput = document.querySelector("#search");
const statusFilter = document.querySelector("#status-filter");
const activityTemplate = document.querySelector("#activity-form-template");

let selectedCustomerId = null;

customerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(customerForm);
  const dealValue = Number.parseFloat(formData.get("dealValue") || "0");
  const customer = {
    company: formData.get("company"),
    contactName: formData.get("contactName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    status: formData.get("status"),
    dealValueCents: Number.isFinite(dealValue) ? Math.round(dealValue * 100) : 0,
    nextFollowUp: formData.get("nextFollowUp"),
    notes: formData.get("notes")
  };

  await api("/api/customers", {
    method: "POST",
    body: JSON.stringify(customer)
  });

  customerForm.reset();
  await loadCustomers();
});

searchInput.addEventListener("input", debounce(loadCustomers, 180));
statusFilter.addEventListener("change", loadCustomers);

async function loadCustomers() {
  const params = new URLSearchParams();

  if (searchInput.value.trim()) {
    params.set("q", searchInput.value.trim());
  }

  if (statusFilter.value) {
    params.set("status", statusFilter.value);
  }

  const { customers } = await api(`/api/customers?${params}`);
  renderCustomers(customers);
}

function renderCustomers(customers) {
  if (customers.length === 0) {
    customersEl.innerHTML = '<div class="empty-state">No customers yet.</div>';
    return;
  }

  customersEl.replaceChildren(
    ...customers.map((customer) => {
      const card = document.createElement("article");
      card.className = `customer-card${customer.id === selectedCustomerId ? " active" : ""}`;
      card.tabIndex = 0;
      card.innerHTML = `
        <div class="panel-heading">
          <h3>${escapeHtml(customer.company)}</h3>
          <span class="status">${escapeHtml(customer.status)}</span>
        </div>
        <div class="meta">
          <span>${escapeHtml(customer.contactName || "No contact")}</span>
          <span>${formatCurrency(customer.dealValueCents)}</span>
          <span>${customer.nextFollowUp ? `Follow up ${escapeHtml(customer.nextFollowUp)}` : "No follow-up"}</span>
        </div>
      `;
      card.addEventListener("click", () => selectCustomer(customer.id));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectCustomer(customer.id);
        }
      });
      return card;
    })
  );
}

async function selectCustomer(id) {
  selectedCustomerId = id;
  await loadCustomerDetails(id);
  await loadCustomers();
}

async function loadCustomerDetails(id) {
  const { customer } = await api(`/api/customers/${id}`);
  selectedLabel.textContent = customer.company;

  const activityForm = activityTemplate.content.firstElementChild.cloneNode(true);
  activityForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(activityForm);

    await api(`/api/customers/${customer.id}/activities`, {
      method: "POST",
      body: JSON.stringify({
        type: formData.get("type"),
        summary: formData.get("summary")
      })
    });

    await loadCustomerDetails(customer.id);
  });

  const details = document.createElement("div");
  details.className = "detail-block";
  details.innerHTML = `
    <h3>${escapeHtml(customer.company)}</h3>
    <div class="meta">
      <span>${escapeHtml(customer.contactName || "No contact")}</span>
      <span>${escapeHtml(customer.email || "No email")}</span>
      <span>${escapeHtml(customer.phone || "No phone")}</span>
    </div>
    <p>${escapeHtml(customer.notes || "No notes yet.")}</p>
  `;

  const list = document.createElement("ul");
  list.className = "activity-list";

  if (customer.activities.length === 0) {
    list.innerHTML = '<li class="activity-item">No activity yet.</li>';
  } else {
    list.replaceChildren(
      ...customer.activities.map((activity) => {
        const item = document.createElement("li");
        item.className = "activity-item";
        item.innerHTML = `
          <strong>${escapeHtml(activity.type)}</strong>
          <p>${escapeHtml(activity.summary)}</p>
          <span class="muted">${formatDateTime(activity.happenedAt)}</span>
        `;
        return item;
      })
    );
  }

  detailsEl.className = "detail-block";
  detailsEl.replaceChildren(details, activityForm, list);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    },
    ...options
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

function formatCurrency(cents) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD"
  }).format(cents / 100);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function debounce(fn, delay) {
  let timeout;

  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), delay);
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

loadCustomers().catch((error) => {
  customersEl.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
});
