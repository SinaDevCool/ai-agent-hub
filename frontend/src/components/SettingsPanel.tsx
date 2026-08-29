import { Clipboard, Download, KeyRound, Link2, LogOut, Pencil, Play, ShieldOff, Trash2, Unplug, Workflow } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Agent, ConnectedAccount, CreatorAccessRequest, WorkflowProvider } from "../api/types";
import type { useWorkflows } from "../hooks/useWorkflows";
import type { useLifePlatform } from "../hooks/useLifePlatform";

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function copyText(value: string) {
  void navigator.clipboard?.writeText(value);
}

function formatCurrency(amount: number | string, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(amount));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function SettingsPanel(props: {
  activityCount: number;
  canUseCreatorTools: boolean;
  className: string;
  creatorAccessError: string;
  creatorAccessReason: string;
  creatorAccessRequest: CreatorAccessRequest | null;
  connectedAccounts: ConnectedAccount[];
  connectorError: string;
  connectorMessage: string;
  agentCount: number;
  isConnectorSaving: boolean;
  isCreatorAccessSaving: boolean;
  onConnectGoogle: () => void | Promise<void>;
  onConnectMicrosoft: () => void | Promise<void>;
  onDisconnectConnector: (accountId: string) => void | Promise<void>;
  onExportData: () => void;
  onManageAccess: () => void;
  onOpenCreator: () => void;
  onCreatorAccessReasonChange: (reason: string) => void;
  onRequestCreatorAccess: () => Promise<CreatorAccessRequest | null>;
  onRevokeAllAccess: () => void;
  onSignOut?: () => void;
  privateInfoCount: number;
  userEmail: string;
  visibleAgents: Agent[];
  workflows: ReturnType<typeof useWorkflows>;
  lifePlatform: ReturnType<typeof useLifePlatform>;
}) {
  const [exportNotice, setExportNotice] = useState("");
  const [creatorValidation, setCreatorValidation] = useState("");
  const [workflowDraft, setWorkflowDraft] = useState({
    name: "",
    provider: "n8n" as WorkflowProvider,
    capabilityKey: "general.research",
    description: "",
    endpointUrl: "",
    agentId: ""
  });
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [travelSearch, setTravelSearch] = useState({ origin: "BER", destination: "LHR", departureDate: "" });
  const [passengerName, setPassengerName] = useState("");
  const [appointmentSearch, setAppointmentSearch] = useState({ specialty: "Dentist", location: "Berlin", date: "" });
  const [rescheduleAppointmentId, setRescheduleAppointmentId] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState("noise cancelling headphones");
  const [productQuantity, setProductQuantity] = useState(1);
  const [householdSearch, setHouseholdSearch] = useState({ serviceType: "Plumber", location: "Berlin", description: "Repair a leaking kitchen tap" });
  const [restaurantSearch, setRestaurantSearch] = useState({ location: "Berlin", cuisine: "Italian", dateTime: "", partySize: 2 });
  const [eventSearch, setEventSearch] = useState({ location: "Berlin", startDate: "", endDate: "" });
  const [energyDates, setEnergyDates] = useState({ startDate: "", endDate: "" });
  const [wellnessDates, setWellnessDates] = useState({ startDate: "", endDate: "" });
  const [wellnessPlan, setWellnessPlan] = useState({ goal: "Build a consistent gentle walking routine", startDate: "" });
  const [hotelSearch, setHotelSearch] = useState({ destination: "Paris", checkInDate: "", checkOutDate: "", guests: 2, rooms: 1 });
  const [groundSearch, setGroundSearch] = useState({ origin: "Paris", destination: "Lyon", departureDate: "" });
  const [shoppingListDraft, setShoppingListDraft] = useState({ name: "Weekly groceries", items: "Oats, apples, milk" });
  const [paymentSimulation, setPaymentSimulation] = useState({ payee: "Example Utility", amount: 42.5, currency: "EUR" });

  function submitCreatorRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanReason = props.creatorAccessReason.trim();
    if (cleanReason.length < 12) {
      setCreatorValidation("Tell us what kind of agents you want to publish.");
      return;
    }
    setCreatorValidation("");
    void props.onRequestCreatorAccess();
  }

  function exportData() {
    props.onExportData();
    setExportNotice("Your data export was prepared.");
  }

  function submitWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void props.workflows.createWorkflow({
      name: workflowDraft.name,
      provider: workflowDraft.provider,
      capabilityKey: workflowDraft.capabilityKey,
      description: workflowDraft.description,
      endpointUrl: workflowDraft.endpointUrl,
      agentId: workflowDraft.agentId || null,
      toolName: "workflow.run"
    }).then((workflow) => {
      if (!workflow) return;
      setWorkflowDraft({
        name: "",
        provider: workflowDraft.provider,
        capabilityKey: workflowDraft.capabilityKey,
        description: "",
        endpointUrl: "",
        agentId: ""
      });
    });
  }

  const showCreatorRequestForm = !props.canUseCreatorTools && props.creatorAccessRequest?.status !== "pending";
  const googleAccount = props.connectedAccounts.find((account) => account.provider === "google" && account.status === "active");
  const microsoftAccount = props.connectedAccounts.find((account) => account.provider === "microsoft" && account.status === "active");
  const selectedCapability = props.workflows.capabilities.find((capability) => capability.key === workflowDraft.capabilityKey)
    ?? props.workflows.capabilities.find((capability) => capability.key === "general.research");
  const workflowStatusLabel = {
    active: "active",
    draft: "needs test",
    failed: "needs fix",
    disabled: "disabled"
  };

  return (
    <div className={props.className} id="settings">
      <div className="panel-heading-row settings-heading-row">
        <div>
          <div className="panel-title">Account controls</div>
          <p className="mobile-section-intro">Manage your account, saved info access, and data export.</p>
        </div>
      </div>

      <div className="settings-grid">
        <div><strong>Agents</strong><span>{props.agentCount}</span></div>
        <div><strong>Saved info</strong><span>{props.privateInfoCount}</span></div>
        <div><strong>Activity</strong><span>{props.activityCount}</span></div>
        <div><strong>Account</strong><span>{props.userEmail}</span></div>
      </div>

      <section className="settings-consumer-card">
        <div>
          <strong>Privacy & data</strong>
          <span>Control what agents can read and keep a copy of your workspace data.</span>
        </div>
        <div className="settings-primary-actions" aria-label="Privacy and data actions">
          <button className="primary-action" onClick={props.onManageAccess} type="button"><KeyRound size={16} /> Manage access</button>
          <button onClick={exportData} type="button"><Download size={16} /> Export my data</button>
        </div>
        {exportNotice ? <small className="settings-action-note" role="status" aria-live="polite">{exportNotice}</small> : null}
      </section>

      <section className="settings-connector-card">
        <div>
          <strong>Connected accounts</strong>
          <span>Connect services your agents can use. Agents still need your approval before using private info or taking sensitive actions.</span>
        </div>
        <div className="connector-row">
          <div>
            <strong>Google</strong>
            <span>{googleAccount ? `${googleAccount.accountLabel} connected` : "Connect Gmail drafts and Calendar read access"}</span>
          </div>
          {googleAccount ? (
            <button disabled={props.isConnectorSaving} onClick={() => void props.onDisconnectConnector(googleAccount.id)} type="button">
              <Unplug size={16} /> Disconnect
            </button>
          ) : (
            <button disabled={props.isConnectorSaving} onClick={() => void props.onConnectGoogle()} type="button">
              <Link2 size={16} /> {props.isConnectorSaving ? "Opening…" : "Connect Google"}
            </button>
          )}
        </div>
        <div className="connector-row">
          <div><strong>Microsoft</strong><span>{microsoftAccount ? `${microsoftAccount.accountLabel} connected` : "Connect Outlook, Calendar, and OneDrive"}</span></div>
          {microsoftAccount ? <button disabled={props.isConnectorSaving} onClick={() => void props.onDisconnectConnector(microsoftAccount.id)} type="button"><Unplug size={16} /> Disconnect</button> : <button disabled={props.isConnectorSaving} onClick={() => void props.onConnectMicrosoft()} type="button"><Link2 size={16} /> {props.isConnectorSaving ? "Opening…" : "Connect Microsoft"}</button>}
        </div>
        {props.connectorMessage ? <small className="settings-action-note" role="status" aria-live="polite">{props.connectorMessage}</small> : null}
        {props.connectorError ? <small className="form-error">{props.connectorError}</small> : null}
      </section>

      <section className="settings-consumer-card danger-zone">
        <div>
          <strong>Safety</strong>
          <span>Remove every agent's saved-info access if you want to reset permissions. Agents stop using saved info until you allow access again.</span>
        </div>
        <button onClick={props.onRevokeAllAccess} type="button"><ShieldOff size={16} /> Remove all agent access</button>
      </section>

      <section className="settings-connector-card">
        <div>
          <strong>Life services</strong>
          <span>{props.lifePlatform.capabilities.length} capabilities across {new Set(props.lifePlatform.capabilities.map((item) => item.domain)).size} areas, with provider availability shown honestly.</span>
        </div>
        <div className="settings-grid">
          <div><strong>Providers</strong><span>{props.lifePlatform.providers.length}</span></div>
          <div><strong>Ready now</strong><span>{props.lifePlatform.readiness.filter((item) => item.executable).length}</span></div>
          <div><strong>Partner gated</strong><span>{props.lifePlatform.providers.filter((item) => item.access === "partner_approval").length}</span></div>
          <div><strong>Regulated</strong><span>{props.lifePlatform.providers.filter((item) => item.access === "regulated_partner").length}</span></div>
        </div>
        <form className="workflow-form" onSubmit={(event) => { event.preventDefault(); void props.lifePlatform.searchTravel(travelSearch); }}>
          <label><span>From</span><input aria-label="Origin airport" maxLength={3} onChange={(event) => setTravelSearch((current) => ({ ...current, origin: event.currentTarget.value.toUpperCase() }))} required value={travelSearch.origin} /></label>
          <label><span>To</span><input aria-label="Destination airport" maxLength={3} onChange={(event) => setTravelSearch((current) => ({ ...current, destination: event.currentTarget.value.toUpperCase() }))} required value={travelSearch.destination} /></label>
          <label><span>Departure</span><input aria-label="Departure date" min={localToday()} onChange={(event) => setTravelSearch((current) => ({ ...current, departureDate: event.currentTarget.value }))} required type="date" value={travelSearch.departureDate} /></label>
          <label><span>Passenger name</span><input aria-label="Passenger name" onChange={(event) => setPassengerName(event.currentTarget.value)} placeholder="As shown on ID" required value={passengerName} /></label>
          <button disabled={props.lifePlatform.isSaving} type="submit">Search sandbox flights</button>
        </form>
        {props.lifePlatform.travelOffers.length ? <div className="workflow-list" aria-label="Sandbox flight offers">
          {props.lifePlatform.travelOffers.map((offer) => <div className="workflow-row" key={offer.id}>
            <div><strong>{offer.carrier}: {offer.origin} → {offer.destination}</strong><span>{offer.departureDate} · {formatCurrency(offer.amount, offer.currency)}</span><small>{offer.refundable ? "Refundable sandbox fare" : "Non-refundable sandbox fare"} · expires {formatDateTime(offer.expiresAt)}</small></div>
            <button disabled={props.lifePlatform.isSaving || !passengerName.trim()} onClick={() => void props.lifePlatform.bookTravel(offer, passengerName)} type="button">Confirm {formatCurrency(offer.amount, offer.currency)} sandbox booking</button>
          </div>)}
        </div> : null}
        <form className="workflow-form" onSubmit={(event) => { event.preventDefault(); void props.lifePlatform.searchHotels(hotelSearch); }}>
          <label><span>Hotel destination</span><input aria-label="Hotel destination" onChange={(event) => setHotelSearch((current) => ({ ...current, destination: event.currentTarget.value }))} required value={hotelSearch.destination} /></label>
          <label><span>Check in</span><input aria-label="Hotel check in" onChange={(event) => setHotelSearch((current) => ({ ...current, checkInDate: event.currentTarget.value }))} required type="date" value={hotelSearch.checkInDate} /></label>
          <label><span>Check out</span><input aria-label="Hotel check out" min={hotelSearch.checkInDate || undefined} onChange={(event) => setHotelSearch((current) => ({ ...current, checkOutDate: event.currentTarget.value }))} required type="date" value={hotelSearch.checkOutDate} /></label>
          <label><span>Guests</span><input aria-label="Hotel guests" min={1} onChange={(event) => setHotelSearch((current) => ({ ...current, guests: Number(event.currentTarget.value) }))} required type="number" value={hotelSearch.guests} /></label>
          <label><span>Rooms</span><input aria-label="Hotel rooms" min={1} onChange={(event) => setHotelSearch((current) => ({ ...current, rooms: Number(event.currentTarget.value) }))} required type="number" value={hotelSearch.rooms} /></label>
          <button disabled={props.lifePlatform.isSaving} type="submit">Search sandbox hotels</button>
        </form>
        {props.lifePlatform.hotelOffers.length ? <div className="workflow-list" aria-label="Sandbox hotel offers">{props.lifePlatform.hotelOffers.map((offer) => <div className="workflow-row" key={offer.id}><div><strong>{offer.propertyName}</strong><span>{offer.checkInDate}–{offer.checkOutDate} · {formatCurrency(offer.amount, offer.currency)}</span><small>{offer.refundable ? "Refundable" : "Non-refundable"} sandbox stay</small></div><button disabled={props.lifePlatform.isSaving} onClick={() => void props.lifePlatform.bookHotel(offer)} type="button">Confirm sandbox hotel booking</button></div>)}</div> : null}
        <form className="workflow-form" onSubmit={(event) => { event.preventDefault(); void props.lifePlatform.searchGround(groundSearch); }}>
          <label><span>Ground from</span><input aria-label="Ground origin" onChange={(event) => setGroundSearch((current) => ({ ...current, origin: event.currentTarget.value }))} required value={groundSearch.origin} /></label>
          <label><span>Ground to</span><input aria-label="Ground destination" onChange={(event) => setGroundSearch((current) => ({ ...current, destination: event.currentTarget.value }))} required value={groundSearch.destination} /></label>
          <label><span>Departure</span><input aria-label="Ground departure date" onChange={(event) => setGroundSearch((current) => ({ ...current, departureDate: event.currentTarget.value }))} required type="date" value={groundSearch.departureDate} /></label>
          <button disabled={props.lifePlatform.isSaving} type="submit">Search sandbox ground transport</button>
        </form>
        {props.lifePlatform.groundOffers.length ? <div className="workflow-list" aria-label="Sandbox ground offers">{props.lifePlatform.groundOffers.map((offer) => <div className="workflow-row" key={offer.id}><div><strong>{offer.operator} · {offer.mode}</strong><span>{offer.origin} → {offer.destination} · {formatCurrency(offer.amount, offer.currency)}</span><small>{formatDateTime(offer.departureAt)} · discovery only</small></div></div>)}</div> : null}
        {props.lifePlatform.itinerary?.items.length ? <div className="workflow-list" aria-label="Sandbox itinerary">{props.lifePlatform.itinerary.items.map((item) => <div className="workflow-row" key={item.transactionId}><div><strong>{item.capabilityKey.replace(/\./g, " ")}</strong><span>{item.reference ?? "Reference pending"}</span><small>Confirmed sandbox itinerary item</small></div></div>)}</div> : <small>No confirmed sandbox itinerary yet.</small>}
        <div>
          <strong>Appointments</strong>
          <span>Search and manage deterministic sandbox appointments. No clinic is contacted and no medical advice is provided.</span>
        </div>
        <form className="workflow-form" onSubmit={(event) => { event.preventDefault(); void props.lifePlatform.searchAppointments(appointmentSearch); }}>
          <label><span>Specialty</span><input aria-label="Appointment specialty" onChange={(event) => setAppointmentSearch((current) => ({ ...current, specialty: event.currentTarget.value }))} required value={appointmentSearch.specialty} /></label>
          <label><span>Location</span><input aria-label="Appointment location" onChange={(event) => setAppointmentSearch((current) => ({ ...current, location: event.currentTarget.value }))} required value={appointmentSearch.location} /></label>
          <label><span>Date</span><input aria-label="Appointment date" min={localToday()} onChange={(event) => setAppointmentSearch((current) => ({ ...current, date: event.currentTarget.value }))} required type="date" value={appointmentSearch.date} /></label>
          <button disabled={props.lifePlatform.isSaving} type="submit">Search sandbox appointments</button>
        </form>
        {rescheduleAppointmentId ? <small role="status">Choose a slot below to reschedule. <button onClick={() => setRescheduleAppointmentId(null)} type="button">Cancel rescheduling</button></small> : null}
        {props.lifePlatform.appointmentSlots.length ? <div className="workflow-list" aria-label="Sandbox appointment slots">
          {props.lifePlatform.appointmentSlots.map((slot) => <div className="workflow-row" key={slot.id}>
            <div><strong>{slot.providerName}</strong><span>{slot.specialty} · {formatDateTime(slot.startsAt)} · {slot.location}</span><small>Sandbox availability only</small></div>
            <button disabled={props.lifePlatform.isSaving} onClick={() => { if (rescheduleAppointmentId) { void props.lifePlatform.rescheduleAppointment(rescheduleAppointmentId, slot).then((value) => { if (value) setRescheduleAppointmentId(null); }); } else { void props.lifePlatform.bookAppointment(slot); } }} type="button">{rescheduleAppointmentId ? "Confirm new sandbox time" : "Confirm sandbox appointment"}</button>
          </div>)}
        </div> : null}
        {props.lifePlatform.appointments.length ? <div className="workflow-list" aria-label="My appointments">
          {props.lifePlatform.appointments.map((appointment) => <div className="workflow-row" key={appointment.id}>
            <div><strong>{appointment.specialty} with {appointment.providerName}</strong><span>{formatDateTime(appointment.startsAt)} · {appointment.location}</span><small>{appointment.confirmationCode} · {appointment.providerId === "appointment-sandbox" ? "sandbox" : "connected provider"}</small></div>
            <span className={`status-pill ${appointment.status === "confirmed" ? "green" : "amber"}`}>{appointment.status}</span>
            {appointment.status === "confirmed" ? <button disabled={props.lifePlatform.isSaving} onClick={() => setRescheduleAppointmentId(appointment.id)} type="button">Reschedule</button> : null}
            {appointment.status === "confirmed" && !Object.keys(appointment.calendarEvent).length ? <button disabled={props.lifePlatform.isSaving} onClick={() => void props.lifePlatform.syncAppointmentCalendar(appointment.id)} type="button">Add to Google Calendar</button> : null}
            {appointment.status === "confirmed" ? <button className="danger" disabled={props.lifePlatform.isSaving} onClick={() => void props.lifePlatform.cancelAppointment(appointment.id)} type="button">Confirm cancellation</button> : null}
          </div>)}
        </div> : <small>No appointments booked.</small>}
        <div><strong>Shopping sandbox</strong><span>Compare example products and practice approval-gated ordering. No merchant is contacted and no payment is taken.</span></div>
        <form className="workflow-form" onSubmit={(event) => { event.preventDefault(); void props.lifePlatform.saveList(shoppingListDraft.name, shoppingListDraft.items.split(",").map((item) => item.trim()).filter(Boolean)); }}>
          <label><span>List name</span><input aria-label="Shopping list name" onChange={(event) => setShoppingListDraft((current) => ({ ...current, name: event.currentTarget.value }))} required value={shoppingListDraft.name} /></label>
          <label><span>Items, comma separated</span><input aria-label="Shopping list items" onChange={(event) => setShoppingListDraft((current) => ({ ...current, items: event.currentTarget.value }))} required value={shoppingListDraft.items} /></label>
          <button disabled={props.lifePlatform.isSaving} type="submit">Save shopping list</button>
        </form>
        {props.lifePlatform.shoppingLists.length ? <div className="workflow-list" aria-label="Saved shopping lists">{props.lifePlatform.shoppingLists.map((list) => <div className="workflow-row" key={list.id}><div><strong>{list.name}</strong><span>{list.items.map((item) => `${item.quantity}× ${item.name}`).join(", ") || "No items"}</span><small>Updated {formatDateTime(list.updatedAt)}</small></div><button className="danger" disabled={props.lifePlatform.isSaving} onClick={() => void props.lifePlatform.removeList(list.id)} type="button">Delete list</button></div>)}</div> : <small>No shopping lists saved.</small>}
        <form className="workflow-form" onSubmit={(event) => { event.preventDefault(); void props.lifePlatform.searchProducts(productQuery); }}>
          <label><span>Product</span><input aria-label="Product search" onChange={(event) => setProductQuery(event.currentTarget.value)} required value={productQuery} /></label>
          <label><span>Quantity</span><input aria-label="Product quantity" max={20} min={1} onChange={(event) => setProductQuantity(Number(event.currentTarget.value))} required type="number" value={productQuantity} /></label>
          <button disabled={props.lifePlatform.isSaving} type="submit">Search sandbox products</button>
        </form>
        {props.lifePlatform.productOffers.length ? <div className="workflow-list" aria-label="Sandbox product offers">{props.lifePlatform.productOffers.map((offer) => <div className="workflow-row" key={offer.id}><div><strong>{offer.title}</strong><span>{offer.merchant} · {formatCurrency(offer.amount, offer.currency)}</span><small>Sandbox offer · no real checkout</small></div><button disabled={props.lifePlatform.isSaving} onClick={() => void props.lifePlatform.orderProduct(offer, productQuantity)} type="button">Confirm sandbox order</button></div>)}</div> : null}
        <div><strong>Household services sandbox</strong><span>Find example providers, request a deterministic quote, and practice approval-gated booking. No professional is contacted.</span></div>
        <form className="workflow-form" onSubmit={(event) => { event.preventDefault(); void props.lifePlatform.searchHousehold(householdSearch); }}>
          <label><span>Service</span><input aria-label="Household service" onChange={(event) => setHouseholdSearch((current) => ({ ...current, serviceType: event.currentTarget.value }))} required value={householdSearch.serviceType} /></label>
          <label><span>Location</span><input aria-label="Household service location" onChange={(event) => setHouseholdSearch((current) => ({ ...current, location: event.currentTarget.value }))} required value={householdSearch.location} /></label>
          <label><span>Problem</span><input aria-label="Household service description" onChange={(event) => setHouseholdSearch((current) => ({ ...current, description: event.currentTarget.value }))} required value={householdSearch.description} /></label>
          <button disabled={props.lifePlatform.isSaving} type="submit">Find sandbox providers</button>
        </form>
        {props.lifePlatform.householdProviders.length ? <div className="workflow-list" aria-label="Sandbox household providers">{props.lifePlatform.householdProviders.map((provider) => <div className="workflow-row" key={provider.id}><div><strong>{provider.name}</strong><span>{provider.serviceType} · {provider.location} · {provider.rating.toFixed(1)} ({provider.reviewCount})</span><small>Verified sandbox profile</small></div><button disabled={props.lifePlatform.isSaving} onClick={() => void props.lifePlatform.quoteHousehold(provider, householdSearch.description)} type="button">Request sandbox quote</button></div>)}</div> : null}
        {props.lifePlatform.householdQuote ? <div className="settings-consumer-card"><div><strong>{formatCurrency(props.lifePlatform.householdQuote.amount, props.lifePlatform.householdQuote.currency)} quote</strong><span>{props.lifePlatform.householdQuote.provider.name} · about {props.lifePlatform.householdQuote.estimatedMinutes} minutes</span><small>Sandbox quote; expires {formatDateTime(props.lifePlatform.householdQuote.expiresAt)}</small></div><button disabled={props.lifePlatform.isSaving} onClick={() => void props.lifePlatform.bookHousehold()} type="button">Confirm sandbox service booking</button></div> : null}
        <div><strong>Leisure sandbox</strong><span>Discover example events and practice restaurant reservations. No venue is contacted and no ticket is purchased.</span></div>
        <form className="workflow-form" onSubmit={(event) => { event.preventDefault(); void props.lifePlatform.searchRestaurants({ ...restaurantSearch, dateTime: new Date(restaurantSearch.dateTime).toISOString() }); }}>
          <label><span>Restaurant area</span><input aria-label="Restaurant location" onChange={(event) => setRestaurantSearch((current) => ({ ...current, location: event.currentTarget.value }))} required value={restaurantSearch.location} /></label>
          <label><span>Cuisine</span><input aria-label="Restaurant cuisine" onChange={(event) => setRestaurantSearch((current) => ({ ...current, cuisine: event.currentTarget.value }))} required value={restaurantSearch.cuisine} /></label>
          <label><span>Date and time</span><input aria-label="Restaurant date and time" onChange={(event) => setRestaurantSearch((current) => ({ ...current, dateTime: event.currentTarget.value }))} required type="datetime-local" value={restaurantSearch.dateTime} /></label>
          <label><span>Party size</span><input aria-label="Restaurant party size" max={20} min={1} onChange={(event) => setRestaurantSearch((current) => ({ ...current, partySize: Number(event.currentTarget.value) }))} required type="number" value={restaurantSearch.partySize} /></label>
          <button disabled={props.lifePlatform.isSaving} type="submit">Find sandbox tables</button>
        </form>
        {props.lifePlatform.restaurantSlots.length ? <div className="workflow-list" aria-label="Sandbox restaurant availability">{props.lifePlatform.restaurantSlots.map((slot) => <div className="workflow-row" key={slot.id}><div><strong>{slot.restaurantName}</strong><span>{slot.cuisine} · {formatDateTime(slot.dateTime)} · table for {slot.partySize}</span><small>Sandbox availability only</small></div><button disabled={props.lifePlatform.isSaving} onClick={() => void props.lifePlatform.reserveRestaurant(slot)} type="button">Confirm sandbox reservation</button></div>)}</div> : null}
        <form className="workflow-form" onSubmit={(event) => { event.preventDefault(); void props.lifePlatform.searchEvents(eventSearch); }}>
          <label><span>Event location</span><input aria-label="Event location" onChange={(event) => setEventSearch((current) => ({ ...current, location: event.currentTarget.value }))} required value={eventSearch.location} /></label>
          <label><span>From</span><input aria-label="Event start date" onChange={(event) => setEventSearch((current) => ({ ...current, startDate: event.currentTarget.value }))} required type="date" value={eventSearch.startDate} /></label>
          <label><span>Until</span><input aria-label="Event end date" min={eventSearch.startDate || undefined} onChange={(event) => setEventSearch((current) => ({ ...current, endDate: event.currentTarget.value }))} required type="date" value={eventSearch.endDate} /></label>
          <button disabled={props.lifePlatform.isSaving} type="submit">Discover sandbox events</button>
        </form>
        {props.lifePlatform.events.length ? <div className="workflow-list" aria-label="Sandbox events">{props.lifePlatform.events.map((item) => <div className="workflow-row" key={item.id}><div><strong>{item.name}</strong><span>{formatDateTime(item.startsAt)} · from {formatCurrency(item.priceFrom, item.currency)}</span><small>Discovery only · no purchase link in sandbox</small></div><span className="status-pill blue">{item.category}</span></div>)}</div> : null}
        <div><strong>Smart home and energy sandbox</strong><span>Control only the example allowlisted devices below. Commands are approval-gated and never reach physical hardware.</span></div>
        <div className="workflow-list" aria-label="Sandbox smart home devices">{props.lifePlatform.homeDevices.map((device) => <div className="workflow-row" key={device.entityId}><div><strong>{device.name}</strong><span>{device.room} · {device.kind} · state: {device.state}</span><small>Sandbox entity {device.entityId}</small></div>{device.allowedCommands.map((command) => <button disabled={props.lifePlatform.isSaving || (command === "turn_on" && device.state === "on") || (command === "turn_off" && device.state === "off")} key={command} onClick={() => void props.lifePlatform.controlHomeDevice(device.entityId, command)} type="button">Confirm {command.replace(/_/g, " ")}</button>)}</div>)}</div>
        <form className="workflow-form" onSubmit={(event) => { event.preventDefault(); void props.lifePlatform.analyzeEnergy(energyDates); }}>
          <label><span>Energy from</span><input aria-label="Energy start date" onChange={(event) => setEnergyDates((current) => ({ ...current, startDate: event.currentTarget.value }))} required type="date" value={energyDates.startDate} /></label>
          <label><span>Energy until</span><input aria-label="Energy end date" min={energyDates.startDate || undefined} onChange={(event) => setEnergyDates((current) => ({ ...current, endDate: event.currentTarget.value }))} required type="date" value={energyDates.endDate} /></label>
          <button disabled={props.lifePlatform.isSaving} type="submit">Analyze sandbox energy</button>
        </form>
        {props.lifePlatform.energyAnalysis ? <div className="settings-grid"><div><strong>Usage</strong><span>{props.lifePlatform.energyAnalysis.totalKwh} kWh</span></div><div><strong>Estimated cost</strong><span>{formatCurrency(props.lifePlatform.energyAnalysis.estimatedCost, props.lifePlatform.energyAnalysis.currency)}</span></div><div><strong>Carbon</strong><span>{props.lifePlatform.energyAnalysis.carbonKg} kg</span></div><div><strong>Mode</strong><span>Read-only sandbox</span></div></div> : null}
        <div><strong>Wellness sandbox</strong><span>Review deterministic sample activity and prepare general, non-diagnostic routines. This is not medical advice or an emergency service.</span></div>
        <form className="workflow-form" onSubmit={(event) => { event.preventDefault(); void props.lifePlatform.readWellnessActivity(wellnessDates); }}>
          <label><span>Activity from</span><input aria-label="Wellness activity start date" onChange={(event) => setWellnessDates((current) => ({ ...current, startDate: event.currentTarget.value }))} required type="date" value={wellnessDates.startDate} /></label>
          <label><span>Activity until</span><input aria-label="Wellness activity end date" min={wellnessDates.startDate || undefined} onChange={(event) => setWellnessDates((current) => ({ ...current, endDate: event.currentTarget.value }))} required type="date" value={wellnessDates.endDate} /></label>
          <button disabled={props.lifePlatform.isSaving} type="submit">Read sample activity</button>
        </form>
        {props.lifePlatform.wellnessActivity ? <><div className="settings-grid"><div><strong>Steps</strong><span>{props.lifePlatform.wellnessActivity.totals.steps.toLocaleString()}</span></div><div><strong>Active time</strong><span>{props.lifePlatform.wellnessActivity.totals.activeMinutes} min</span></div><div><strong>Sleep</strong><span>{props.lifePlatform.wellnessActivity.totals.sleepHours} hours</span></div><div><strong>Mode</strong><span>Read-only sample</span></div></div><small>{props.lifePlatform.wellnessActivity.notice}</small></> : null}
        <form className="workflow-form" onSubmit={(event) => { event.preventDefault(); void props.lifePlatform.prepareWellnessPlan(wellnessPlan); }}>
          <label><span>General wellness goal</span><input aria-label="Wellness goal" onChange={(event) => setWellnessPlan((current) => ({ ...current, goal: event.currentTarget.value }))} required value={wellnessPlan.goal} /></label>
          <label><span>Start date</span><input aria-label="Wellness plan start date" onChange={(event) => setWellnessPlan((current) => ({ ...current, startDate: event.currentTarget.value }))} required type="date" value={wellnessPlan.startDate} /></label>
          <button disabled={props.lifePlatform.isSaving} type="submit">Prepare non-diagnostic plan</button>
        </form>
        <div className="workflow-list" aria-label="Life service provider readiness">
          {props.lifePlatform.providers.map((provider) => {
            const readiness = props.lifePlatform.readiness.find((item) => item.providerId === provider.id);
            const state = readiness?.state ?? "adapter_required";
            const statusClass = readiness?.executable ? "green" : state === "reconnect_required" || state === "connection_error" ? "red" : "amber";
            return <div className="workflow-row" key={provider.id}>
              <div>
                <strong>{provider.label}</strong>
                <span>{provider.domains.join(", ")} · {provider.access.replace(/_/g, " ")} · {provider.regions.join(", ")}</span>
                <small>{readiness?.nextStep ?? "A native adapter and provider configuration are required."}</small>
                <a href={provider.officialDocs} rel="noreferrer" target="_blank">Provider documentation</a>
              </div>
              <span className={`status-pill ${statusClass}`}>{state.replace(/_/g, " ")}</span>
            </div>;
          })}
        </div>
        {props.lifePlatform.transactions.length ? (
          <div className="workflow-list">
            {props.lifePlatform.transactions.slice(0, 5).map((transaction) => {
              const capability = props.lifePlatform.capabilities.find((item) => item.key === transaction.capabilityKey);
              return <div className="workflow-row" key={transaction.id}>
                <div><strong>{capability?.label ?? transaction.capabilityKey}</strong><span>{transaction.providerId ?? transaction.providerCandidates[0] ?? "Provider selection pending"}</span>{transaction.failureReason ? <small>{transaction.failureReason}</small> : null}</div>
                <span className={`status-pill ${transaction.state === "confirmed" ? "green" : transaction.state === "failed" ? "red" : transaction.state === "uncertain" || transaction.state === "reconciliation_required" ? "amber" : "blue"}`}>{transaction.state.replace(/_/g, " ")}</span>
                {transaction.capabilityKey === "travel.flight.book" && transaction.providerId === "life-sandbox" && transaction.state === "confirmed" ? <button disabled={props.lifePlatform.isSaving} onClick={() => void props.lifePlatform.quoteCancellation(transaction.id)} type="button">Get cancellation quote</button> : null}
                {transaction.capabilityKey === "travel.flight.book" && transaction.providerId === "life-sandbox" && transaction.state === "confirmed" && !transaction.result.calendarEvent ? <button disabled={props.lifePlatform.isSaving} onClick={() => void props.lifePlatform.syncTravelCalendar(transaction.id)} type="button">Add itinerary to Google Calendar</button> : null}
                {transaction.capabilityKey === "travel.hotel.book" && transaction.providerId === "life-sandbox" && transaction.state === "confirmed" ? <button className="danger" disabled={props.lifePlatform.isSaving} onClick={() => void props.lifePlatform.cancelHotel(transaction.id)} type="button">Cancel sandbox hotel</button> : null}
                {transaction.capabilityKey === "shopping.order.create" && transaction.providerId === "life-sandbox" && transaction.state === "confirmed" ? <button className="danger" disabled={props.lifePlatform.isSaving} onClick={() => void props.lifePlatform.cancelOrder(transaction.id)} type="button">Cancel sandbox order</button> : null}
                {transaction.capabilityKey === "household.service.book" && transaction.providerId === "life-sandbox" && transaction.state === "confirmed" ? <button className="danger" disabled={props.lifePlatform.isSaving} onClick={() => void props.lifePlatform.cancelHousehold(transaction.id)} type="button">Cancel sandbox service</button> : null}
                {transaction.capabilityKey === "leisure.restaurant.reserve" && transaction.providerId === "life-sandbox" && transaction.state === "confirmed" ? <button className="danger" disabled={props.lifePlatform.isSaving} onClick={() => void props.lifePlatform.cancelRestaurant(transaction.id)} type="button">Cancel sandbox reservation</button> : null}
                {transaction.capabilityKey === "finance.payment.create" && transaction.providerId === "finance-sandbox" && transaction.state === "confirmed" ? <button className="danger" disabled={props.lifePlatform.isSaving} onClick={() => void props.lifePlatform.cancelPayment(transaction.id)} type="button">Cancel payment simulation</button> : null}
              </div>;
            })}
          </div>
        ) : <small>No prepared bookings, payments, orders, or reservations yet.</small>}
        {props.lifePlatform.cancellationQuote ? <div className="settings-consumer-card">
          <div><strong>Cancellation quote</strong><span>{props.lifePlatform.cancellationQuote.refundable ? `${props.lifePlatform.cancellationQuote.refundAmount} ${props.lifePlatform.cancellationQuote.currency} refund` : "No monetary refund"}</span><small>Sandbox booking {props.lifePlatform.cancellationQuote.bookingReference}</small></div>
          <button className="danger" disabled={props.lifePlatform.isSaving} onClick={() => void props.lifePlatform.confirmCancellation(props.lifePlatform.cancellationQuote!.transactionId)} type="button">Confirm cancellation</button>
        </div> : null}
        {props.lifePlatform.error ? <small className="form-error">{props.lifePlatform.error}</small> : null}
      </section>

      <section className="settings-connector-card">
        <div><strong>Read-only finance</strong><span>Synchronize deterministic sandbox accounts and transactions. This feature cannot transfer money, trade, or change a bank account.</span></div>
        <button disabled={props.lifePlatform.isSaving} onClick={() => void props.lifePlatform.syncFinance()} type="button">{props.lifePlatform.financeSummary?.sandbox ? "Refresh finance sandbox" : "Load finance sandbox"}</button>
        {props.lifePlatform.financeSummary ? <>
          <div className="settings-grid">
            <div><strong>Income</strong><span>{formatCurrency(props.lifePlatform.financeSummary.totals.income, props.lifePlatform.financeSummary.totals.currency)}</span></div>
            <div><strong>Spending</strong><span>{formatCurrency(props.lifePlatform.financeSummary.totals.spending, props.lifePlatform.financeSummary.totals.currency)}</span></div>
            <div><strong>Net cash flow</strong><span>{formatCurrency(props.lifePlatform.financeSummary.totals.netCashFlow, props.lifePlatform.financeSummary.totals.currency)}</span></div>
            <div><strong>Mode</strong><span>Read only · {props.lifePlatform.financeSummary.sandbox ? "sandbox" : "connected"}</span></div>
          </div>
          <div className="workflow-list" aria-label="Recent financial transactions">{props.lifePlatform.financeSummary.transactions.slice(0, 6).map((transaction) => <div className="workflow-row" key={transaction.id}><div><strong>{transaction.merchantName ?? transaction.name}</strong><span>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(transaction.date))} · {transaction.categoryPrimary?.replace(/_/g, " ") ?? "Uncategorized"}</span></div><span>{formatCurrency(transaction.amount, transaction.currency)}</span></div>)}</div>
        </> : <small>No financial information has been loaded.</small>}
        <form className="workflow-form" onSubmit={(event) => { event.preventDefault(); void props.lifePlatform.simulatePayment(paymentSimulation); }}>
          <div><strong>Payment safety simulation</strong><span>Practice an approval-gated payment without contacting a bank, payee, account, or payment network. No money can move.</span></div>
          <label><span>Example payee</span><input maxLength={120} required value={paymentSimulation.payee} onChange={(event) => setPaymentSimulation((value) => ({ ...value, payee: event.target.value }))} /></label>
          <label><span>Amount</span><input min="0.01" max="10000" required step="0.01" type="number" value={paymentSimulation.amount} onChange={(event) => setPaymentSimulation((value) => ({ ...value, amount: Number(event.target.value) }))} /></label>
          <label><span>Currency</span><input maxLength={3} minLength={3} pattern="[A-Za-z]{3}" required value={paymentSimulation.currency} onChange={(event) => setPaymentSimulation((value) => ({ ...value, currency: event.target.value.toUpperCase() }))} /></label>
          <button disabled={props.lifePlatform.isSaving} type="submit">Confirm simulated payment</button>
          <small>Simulation only. The resulting reference is synthetic and cannot be used as proof of payment.</small>
        </form>
      </section>

      <div className="settings-section-grid">
        {props.canUseCreatorTools ? <section>
          <strong>Creator tools available</strong>
          <span>Create and publish agents when you want to supply the marketplace.</span>
          <button onClick={props.onOpenCreator} type="button"><Pencil size={16} /> Open Creator Studio</button>
        </section> : (
          <section className="creator-access-card">
            <strong>Want to publish agents?</strong>
            {props.creatorAccessRequest?.status === "pending" ? (
              <span>Creator request pending. We will unlock publishing after marketplace review.</span>
            ) : props.creatorAccessRequest?.status === "denied" ? (
              <span>{props.creatorAccessRequest.reviewNote || "Your last request needs more detail before creator tools can be enabled."}</span>
            ) : (
              <span>Request creator access when you are ready.</span>
            )}
            {creatorValidation ? <small className="form-error">{creatorValidation}</small> : null}
            {props.creatorAccessError ? <small className="form-error">{props.creatorAccessError}</small> : null}
            {showCreatorRequestForm ? (
              <form className="creator-access-form" noValidate onSubmit={submitCreatorRequest}>
                <label htmlFor="creator-access-reason">
                  <span>What do you want to publish?</span>
                  <textarea
                    autoComplete="off"
                    id="creator-access-reason"
                    maxLength={800}
                    name="creator-access-reason"
                    onChange={(event) => {
                      if (creatorValidation) setCreatorValidation("");
                      props.onCreatorAccessReasonChange(event.currentTarget.value);
                    }}
                    placeholder="Example: travel agents that plan trips and ask before booking."
                    rows={3}
                    value={props.creatorAccessReason}
                  />
                </label>
                <button disabled={props.isCreatorAccessSaving} type="submit">
                  <Pencil size={16} /> {props.isCreatorAccessSaving ? "Requesting…" : "Request creator access"}
                </button>
              </form>
            ) : null}
          </section>
        )}
        <section>
          <strong>Privacy note</strong>
          <span>Agents start restricted. If you remove all access, they stop using saved info until you allow access again.</span>
        </section>
      </div>

      <section className="settings-advanced-card">
        <div className="settings-advanced-heading">
          <div>
            <strong>Connected automations</strong>
            <span>Connect outside automations for agents that need to search, compare, book, draft, or update data in other tools.</span>
          </div>
          <button aria-expanded={isAdvancedOpen} onClick={() => setIsAdvancedOpen((current) => !current)} type="button">
            {isAdvancedOpen ? "Hide connected automations" : "Show connected automations"}
          </button>
        </div>

        {isAdvancedOpen ? (
          <div className="settings-advanced-body">
            <section className="settings-connector-card workflow-card">
              <div>
                <strong>Connected automations</strong>
                <span>Use n8n, Make, Zapier, or a custom webhook when an agent needs outside automation.</span>
              </div>
              <form className="workflow-form" onSubmit={submitWorkflow}>
                <label>
                  <span>Name</span>
                  <input
                    maxLength={120}
                    name="automation-name"
                    onChange={(event) => setWorkflowDraft((current) => ({ ...current, name: event.currentTarget.value }))}
                    placeholder="Travel search automation"
                    required
                    value={workflowDraft.name}
                  />
                </label>
                <label>
                  <span>Tool</span>
                  <select
                    name="automation-provider"
                    onChange={(event) => setWorkflowDraft((current) => ({ ...current, provider: event.currentTarget.value as WorkflowProvider }))}
                    value={workflowDraft.provider}
                  >
                    <option value="n8n">n8n</option>
                    <option value="make">Make</option>
                    <option value="zapier">Zapier</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                <label className="workflow-form-wide">
                  <span>What can this automation do?</span>
                  <select
                    name="automation-capability"
                    onChange={(event) => setWorkflowDraft((current) => ({ ...current, capabilityKey: event.currentTarget.value }))}
                    value={workflowDraft.capabilityKey}
                  >
                    {props.workflows.capabilities.map((capability) => (
                      <option key={capability.key} value={capability.key}>{capability.category}: {capability.label}</option>
                    ))}
                    {props.workflows.capabilities.length === 0 ? <option value="general.research">Daily Tasks: Research online</option> : null}
                  </select>
                </label>
                <label className="workflow-form-wide">
                  <span>Description</span>
                  <input
                    maxLength={280}
                    name="automation-description"
                    onChange={(event) => setWorkflowDraft((current) => ({ ...current, description: event.currentTarget.value }))}
                    placeholder="Searches hotels across booking sources"
                    value={workflowDraft.description}
                  />
                </label>
                <label className="workflow-form-wide">
                  <span>Webhook URL</span>
                  <input
                    name="automation-webhook-url"
                    onChange={(event) => setWorkflowDraft((current) => ({ ...current, endpointUrl: event.currentTarget.value }))}
                    placeholder="https://example.com/agent-webhook"
                    required
                    type="url"
                    value={workflowDraft.endpointUrl}
                  />
                </label>
                <label>
                  <span>Agent</span>
                  <select
                    name="automation-agent"
                    onChange={(event) => setWorkflowDraft((current) => ({ ...current, agentId: event.currentTarget.value }))}
                    value={workflowDraft.agentId}
                  >
                    <option value="">Any agent using workflow.run</option>
                    {props.visibleAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                  </select>
                </label>
                <button disabled={props.workflows.isSaving} type="submit">
                  <Workflow size={16} /> {props.workflows.isSaving ? "Saving…" : "Add automation"}
                </button>
              </form>

              {selectedCapability ? (
                <div className="workflow-contract-panel">
                  <div className="workflow-contract-heading">
                    <div>
                      <strong>{selectedCapability.label} technical format</strong>
                      <span>{selectedCapability.description}</span>
                    </div>
                    <span className="status-pill blue">{selectedCapability.category}</span>
                  </div>
                  <div className="workflow-contract-grid">
                    <div>
                      <div className="contract-title-row">
                        <strong>Automation input</strong>
                        <button onClick={() => copyText(formatJson(selectedCapability.contract.receives))} type="button"><Clipboard size={14} /> Copy</button>
                      </div>
                      <pre>{formatJson(selectedCapability.contract.receives)}</pre>
                    </div>
                    <div>
                      <div className="contract-title-row">
                        <strong>Automation result</strong>
                        <button onClick={() => copyText(formatJson(selectedCapability.contract.returns))} type="button"><Clipboard size={14} /> Copy</button>
                      </div>
                      <pre>{formatJson(selectedCapability.contract.returns)}</pre>
                    </div>
                  </div>
                  <div className="workflow-contract-fields">
                    <div><strong>Required</strong><span>{selectedCapability.contract.requiredFields.join(", ")}</span></div>
                    <div><strong>Optional</strong><span>{selectedCapability.contract.optionalFields.join(", ")}</span></div>
                    <div><strong>Tips</strong><span>{selectedCapability.contract.tips.join(" ")}</span></div>
                  </div>
                </div>
              ) : null}

              {props.workflows.lastSigningSecret ? (
                <div className="workflow-secret-note">
                  <strong>Signing secret</strong>
                  <code>{props.workflows.lastSigningSecret}</code>
                  <span>Add this secret to your automation tool now. It is shown only once.</span>
                </div>
              ) : null}

              <div className="workflow-list">
                {props.workflows.workflows.length === 0 ? (
                  <div className="workflow-empty">
                    <strong>No automations connected yet</strong>
                    <span>Add one when an agent needs to search, compare, book, draft, or update something outside this hub.</span>
                  </div>
                ) : props.workflows.workflows.map((workflow) => {
                  const agent = props.visibleAgents.find((item) => item.id === workflow.agentId);
                  return (
                    <div className="workflow-row" key={workflow.id}>
                      <div>
                        <strong>{workflow.name}</strong>
                        <span>{workflow.capability?.label ?? workflow.capabilityKey}</span>
                        {workflow.description ? <small>{workflow.description}</small> : null}
                        <span>{workflow.provider} · {agent?.name ?? "Any agent"} · {new URL(workflow.endpointUrl).hostname}</span>
                        {workflow.lastFailureReason ? <small>{workflow.lastFailureReason}</small> : null}
                      </div>
                      <span className={`status-pill ${workflow.status === "active" ? "green" : workflow.status === "failed" ? "red" : workflow.status === "disabled" ? "amber" : "blue"}`}>
                        {workflowStatusLabel[workflow.status]}
                      </span>
                      <div className="workflow-actions">
                        <button disabled={props.workflows.isSaving} onClick={() => void props.workflows.testWorkflow(workflow.id)} type="button">
                          <Play size={16} /> Test
                        </button>
                        <button
                          disabled={props.workflows.isSaving}
                          onClick={() => void props.workflows.setWorkflowStatus(workflow.id, workflow.status === "disabled" ? "active" : "disabled")}
                          type="button"
                        >
                          {workflow.status === "disabled" ? "Enable" : "Disable"}
                        </button>
                        <button className="danger" disabled={props.workflows.isSaving} onClick={() => void props.workflows.deleteWorkflow(workflow.id)} type="button">
                          <Trash2 size={16} /> Remove
                        </button>
                      </div>
                      {props.workflows.lastTestPreview?.workflowId === workflow.id ? (
                        <div className={`workflow-test-preview ${props.workflows.lastTestPreview.result?.quality ?? "malformed"}`}>
                          <strong>{props.workflows.lastTestPreview.result ? props.workflows.lastTestPreview.result.title : "Test needs attention"}</strong>
                          <span>{props.workflows.lastTestPreview.result ? props.workflows.lastTestPreview.result.summary : props.workflows.lastTestPreview.reason}</span>
                          {props.workflows.lastTestPreview.result ? (
                            <small>Result quality: {props.workflows.lastTestPreview.result.quality}. {props.workflows.lastTestPreview.result.items.length} item{props.workflows.lastTestPreview.result.items.length === 1 ? "" : "s"} returned.</small>
                          ) : <small>Check the webhook URL, signing secret, and returned JSON shape.</small>}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {props.workflows.message ? <small>{props.workflows.message}</small> : null}
              {props.workflows.error ? <small className="form-error">{props.workflows.error}</small> : null}
            </section>
          </div>
        ) : null}
      </section>

      <div className="privacy-actions">
        {props.onSignOut ? <button onClick={props.onSignOut} type="button"><LogOut size={16} /> Sign out</button> : null}
      </div>
      <p className="empty">Your workspace data is scoped to your signed-in account.</p>
    </div>
  );
}
