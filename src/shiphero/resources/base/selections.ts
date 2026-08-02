/**
 * Reusable selection sets.
 *
 * ShipHero charges credits per requested row, and nested connections multiply the
 * estimate (a 100-row query with 100-row line items is estimated at 10001 credits).
 * Every nested connection here therefore carries an explicit `first`, and each
 * resource exposes a lean default plus a wider variant to opt into.
 *
 * Each export is registered in `SELECTION_ROOT_TYPES` so
 * `yarn check:shiphero` can verify every field against the generated schema.
 */

/** `Address`, used by warehouses, vendors, shipments and returns. */
export const ADDRESS = `
  name
  address1
  address2
  city
  state
  country
  zip
  phone
`;

/** `OrderAddress`, which splits the name and carries validated country/state codes. */
export const ORDER_ADDRESS = `
  first_name
  last_name
  company
  address1
  address2
  city
  state
  state_code
  zip
  country
  country_code
  email
  phone
`;

export const DIMENSIONS = `
  weight
  height
  width
  length
`;

/** Identity and inventory-relevant fields of a warehouse-scoped product record. */
export const WAREHOUSE_PRODUCT = `
  id
  legacy_id
  account_id
  sku
  warehouse_id
  warehouse_identifier
  on_hand
  available
  allocated
  backorder
  non_sellable_quantity
  reserve_inventory
  inventory_bin
  inventory_overstock_bin
  reorder_level
  reorder_amount
  price
  value
  value_currency
  customs_value
  active
  sell_ahead
  created_at
  updated_at
`;

/** Catalogue fields only: cheap enough to page 100 at a time. */
export const PRODUCT = `
  id
  legacy_id
  account_id
  sku
  name
  barcode
  price
  value
  value_currency
  customs_value
  customs_description
  country_of_manufacture
  tariff_code
  dimensions { ${DIMENSIONS} }
  kit
  kit_build
  virtual
  active
  needs_lot_tracking
  needs_serial_number
  is_assembly
  dropship
  not_owned
  no_air
  final_sale
  product_note
  packer_note
  vendor_part_number
  created_at
  updated_at
  tags
`;

/** Catalogue plus per-warehouse stock, kit components and vendors. */
export const PRODUCT_WITH_INVENTORY = `
  ${PRODUCT}
  warehouse_products { ${WAREHOUSE_PRODUCT} }
  kit_components { id legacy_id account_id sku quantity }
  vendors { vendor_id vendor_sku price }
`;

export const VENDOR = `
  id
  legacy_id
  name
  email
  account_number
  account_id
  currency
  internal_note
  default_po_note
  partner_vendor_id
  created_at
  address { ${ADDRESS} }
`;

export const WAREHOUSE = `
  id
  legacy_id
  account_id
  identifier
  company_name
  company_alias
  profile
  dynamic_slotting
  invoice_email
  phone_number
  active
  address { ${ADDRESS} }
  return_address { ${ADDRESS} }
`;

export const PURCHASE_ORDER_LINE_ITEM = `
  id
  legacy_id
  po_id
  po_number
  account_id
  warehouse_id
  vendor_id
  sku
  vendor_sku
  product_id
  barcode
  product_name
  option_title
  quantity
  quantity_received
  quantity_rejected
  price
  fulfillment_status
  sell_ahead
  note
  partner_line_item_id
  expected_weight_in_lbs
  created_at
  updated_at
`;

/** Purchase order header only. */
export const PURCHASE_ORDER = `
  id
  legacy_id
  po_number
  account_id
  warehouse_id
  vendor_id
  po_date
  date_closed
  arrived_at
  ship_date
  fulfillment_status
  po_note
  packing_note
  description
  partner_order_number
  subtotal
  discount
  tax
  total_price
  shipping_price
  shipping_method
  shipping_carrier
  shipping_name
  tracking_number
  payment_method
  payment_due_by
  payment_note
  origin_of_shipment
  created_at
`;

/** Purchase order with its line items. Pass `lineItems` to raise the nested page size. */
export const purchaseOrderWithLineItems = (lineItems = 50) => `
  ${PURCHASE_ORDER}
  line_items(first: ${lineItems}) {
    pageInfo { hasNextPage endCursor }
    edges { node { ${PURCHASE_ORDER_LINE_ITEM} } }
  }
`;

export const ORDER_LINE_ITEM = `
  id
  legacy_id
  order_id
  sku
  partner_line_item_id
  product_id
  product_name
  option_title
  barcode
  custom_barcode
  quantity
  quantity_allocated
  quantity_pending_fulfillment
  quantity_shipped
  backorder_quantity
  price
  subtotal
  promotion_discount
  customs_value
  fulfillment_status
  warehouse_id
  locked_to_warehouse_id
  created_at
  updated_at
`;

/** Order header only. */
export const ORDER = `
  id
  legacy_id
  order_number
  partner_order_id
  shop_name
  source
  partner_source_name
  fulfillment_status
  order_date
  required_ship_date
  hold_until_date
  ready_to_ship
  allow_partial
  allow_split
  priority_flag
  allocation_priority
  flagged
  profile
  email
  currency
  subtotal
  total_tax
  total_discounts
  total_price
  packing_note
  gift_note
  box_name
  tags
  account_id
  created_at
  updated_at
  shipping_lines { title carrier method price }
  shipping_address { ${ORDER_ADDRESS} }
  billing_address { ${ORDER_ADDRESS} }
`;

/** Order with its line items. */
export const orderWithLineItems = (lineItems = 50) => `
  ${ORDER}
  line_items(first: ${lineItems}) {
    pageInfo { hasNextPage endCursor }
    edges { node { ${ORDER_LINE_ITEM} } }
  }
`;

/**
 * Order with line items and their tote picks, which is how ShipHero exposes
 * picking progress.
 */
export const orderWithPicks = (lineItems = 50) => `
  ${ORDER}
  holds { fraud_hold payment_hold operator_hold address_hold shipping_method_hold client_hold }
  allocations { warehouse_id allocated_at allocation_reference ready_to_ship is_locked }
  line_items(first: ${lineItems}) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        ${ORDER_LINE_ITEM}
        tote_picks { id sku quantity picked_quantity current deducted tote_id created_at updated_at }
      }
    }
  }
`;

export const SHIPMENT_LINE_ITEM = `
  id
  legacy_id
  line_item_id
  shipment_id
  shipping_label_id
  quantity
`;

export const SHIPPING_LABEL = `
  id
  legacy_id
  account_id
  shipment_id
  order_id
  order_number
  status
  carrier
  shipping_name
  shipping_method
  cost
  tracking_number
  tracking_url
  tracking_status
  parcelview_url
  package_number
  box_name
  insurance_amount
  delivered
  picked_up
  refunded
  warehouse_id
  created_date
  dimensions { ${DIMENSIONS} }
`;

/** Shipment with its labels and the line items each label covers. */
export const shipment = (lineItems = 50) => `
  id
  legacy_id
  order_id
  user_id
  warehouse_id
  pending_shipment_id
  profile
  total_packages
  picked_up
  delivered
  refunded
  needs_refund
  dropshipment
  completed
  shipped_off_shiphero
  created_date
  address { ${ADDRESS} }
  shipping_labels { ${SHIPPING_LABEL} }
  line_items(first: ${lineItems}) {
    pageInfo { hasNextPage endCursor }
    edges { node { ${SHIPMENT_LINE_ITEM} } }
  }
`;

export const SHIPMENT = shipment();

/** Inbound shipment header, including truck and unload timestamps. */
export const INBOUND_SHIPMENT = `
  id
  legacy_id
  account_id
  warehouse_id
  vendor_id
  status
  status_updated_at
  carrier
  pro_number
  bol_reference
  bol_url
  container_number
  container_size
  load_type
  shipment_type
  number_carton
  pallets_quantity
  people_for_unload
  people_for_receiving
  expected_dock
  dock_used
  notes
  estimated_truck_arrival
  truck_arrived_at
  truck_unload_started_at
  truck_unload_finished_at
  truck_departure_at
  booking_contact_name
  booking_contact_email
  booking_contact_number
  scheduled_at
  created_at
`;

/** Inbound shipment with the purchase orders it carries. */
export const inboundShipmentWithPurchaseOrders = (purchaseOrders = 25, lineItems = 50) => `
  ${INBOUND_SHIPMENT}
  purchase_orders(first: ${purchaseOrders}) {
    pageInfo { hasNextPage endCursor }
    edges { node { ${purchaseOrderWithLineItems(lineItems)} } }
  }
`;

/** What was received against an inbound shipment, grouped by pallet or box (LPN). */
export const INBOUND_SHIPMENT_SUMMARY = `
  stats { pallets_count unpalletized_boxes_count }
  in_lpns {
    quantity_received
    quantity_loose
    lpn { id barcode container_type }
    received_location { id location zone }
    content {
      quantity_received
      quantity_loose
      is_unexpected
      product_info { id sku name }
      lot { id name sku }
      inbound_shipment_line_item { id quantity quantity_received quantity_rejected }
      receiving_location { id location zone }
    }
  }
`;

/** Where received stock was put away, by bin. */
export const INBOUND_SHIPMENT_LOCATION_SUMMARY = `
  locations {
    location { id location zone }
    items_at_location {
      eaches_quantity
      uom
      is_unexpected
      product_info { id sku name }
      lot { id name sku }
      inbound_shipment_line_item { id quantity quantity_received quantity_rejected }
    }
  }
`;

export const INVENTORY_CHANGE = `
  id
  legacy_id
  account_id
  user_id
  warehouse_id
  sku
  previous_on_hand
  change_in_on_hand
  reason
  cycle_counted
  location_id
  lot_id
  lot_name
  lot_expiration
  created_at
`;

export const LOCATION = `
  id
  legacy_id
  account_id
  warehouse_id
  name
  zone
  pickable
  sellable
  is_cart
  temperature
  last_counted
  pick_priority
  dimensions { ${DIMENSIONS} }
  created_at
`;

export const RETURN_LINE_ITEM = `
  id
  legacy_id
  account_id
  return_id
  line_item_id
  product_id
  warehouse_id
  quantity
  quantity_received
  restock
  condition
  reason
  type
  is_component
  created_at
  updated_at
`;

export const RETURN = `
  id
  legacy_id
  account_id
  order_id
  partner_id
  reason
  status
  label_type
  label_cost
  cost_to_customer
  shipping_carrier
  shipping_method
  display_issue_refund
  total_items_expected
  total_items_received
  total_items_restocked
  created_at
  dimensions { ${DIMENSIONS} }
  address { ${ADDRESS} }
  line_items { ${RETURN_LINE_ITEM} }
`;

export const USER = `
  id
  legacy_id
  email
  first_name
  last_name
  position
  default_order_status
  default_warehouse_id
  default_picking_option
  is_admin
  is_active
  is_developer
  created_at
  updated_at
`;

/** The user behind the current token, plus the warehouses it may act on. */
export const AUTHENTICATED_USER = `
  ${USER}
  scopes
  allowed_warehouses { ${WAREHOUSE} }
`;

export const ACCOUNT = `
  id
  legacy_id
  email
  username
  status
  dynamic_slotting
  is_multi_warehouse
  is_3pl
  cycle_count_enabled
  ship_backorders
  warehouses { ${WAREHOUSE} }
`;

export const USER_QUOTA = `
  credits_remaining
  max_available
  increment_rate
  time_remaining
  is_expired
  expiration_date
`;

export const ITEM_LOCATION = `
  id
  legacy_id
  account_id
  warehouse_id
  location_id
  sku
  quantity
  loose_quantity
  allocated_quantity
  created_at
  updated_at
  location { id name zone pickable sellable }
`;

export const ORDER_HISTORY = `
  id
  legacy_id
  order_id
  order_number
  account_id
  user_id
  username
  information
  created_at
`;

export const INVENTORY_SNAPSHOT = `
  snapshot_id
  warehouse_id
  customer_account_id
  status
  error
  snapshot_url
  snapshot_expiration
  post_url
  post_error
  notification_email
  created_at
  enqueued_at
  updated_at
`;

export const WEBHOOK = `
  id
  legacy_id
  account_id
  shop_name
  name
  url
  source
  enabled
  shared_signature_secret
  created_at
  updated_at
  last_enabled_change
`;

/**
 * The GraphQL type each selection above starts from. `yarn check:shiphero`
 * walks these against the generated schema so a renamed or removed field is caught
 * before it reaches the API.
 */
export const SELECTION_ROOT_TYPES: Record<string, string> = {
  ADDRESS: 'Address',
  ORDER_ADDRESS: 'OrderAddress',
  DIMENSIONS: 'Dimensions',
  WAREHOUSE_PRODUCT: 'WarehouseProduct',
  PRODUCT: 'Product',
  PRODUCT_WITH_INVENTORY: 'Product',
  VENDOR: 'Vendor',
  WAREHOUSE: 'Warehouse',
  PURCHASE_ORDER: 'PurchaseOrder',
  PURCHASE_ORDER_LINE_ITEM: 'PurchaseOrderLineItem',
  purchaseOrderWithLineItems: 'PurchaseOrder',
  ORDER: 'Order',
  ORDER_LINE_ITEM: 'LineItem',
  orderWithLineItems: 'Order',
  orderWithPicks: 'Order',
  SHIPMENT: 'Shipment',
  shipment: 'Shipment',
  SHIPMENT_LINE_ITEM: 'ShipmentLineItem',
  SHIPPING_LABEL: 'ShippingLabel',
  INBOUND_SHIPMENT: 'InboundShipment',
  inboundShipmentWithPurchaseOrders: 'InboundShipment',
  INBOUND_SHIPMENT_SUMMARY: 'InboundShipmentSummaryData',
  INBOUND_SHIPMENT_LOCATION_SUMMARY: 'InboundShipmentLocationSummaryData',
  INVENTORY_CHANGE: 'InventoryChange',
  LOCATION: 'Location',
  RETURN: 'Return',
  RETURN_LINE_ITEM: 'ReturnLineItem',
  USER: 'User',
  AUTHENTICATED_USER: 'AuthenticatedUser',
  ACCOUNT: 'Account',
  USER_QUOTA: 'UserQuota',
  ITEM_LOCATION: 'ItemLocation',
  ORDER_HISTORY: 'OrderHistory',
  INVENTORY_SNAPSHOT: 'InventorySnapshot',
  WEBHOOK: 'Webhook'
};
