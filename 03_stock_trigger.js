/**
 * 03_stock_trigger.js
 * ──────────────────────────────────────────────────────────────
 * Atlas Trigger Function (application-side simulation).
 *
 * In production this would be an Atlas App Services Trigger
 * bound to the `orders` collection (UPDATE operation).
 *
 * Logic:
 *   When an order transitions to "Received":
 *     1. Increment the item's quantityInHand by quantityReceived.
 *     2. Check if updated quantityInHand <= reorderLevel.
 *     3. If so → insert a reorderAlert document.
 *
 * This module exports the function so the Express server can
 * invoke it inline when PATCH /api/orders/:id is called.
 * ──────────────────────────────────────────────────────────────
 */

/**
 * Process a received order:
 *   – update item stock
 *   – generate reorder alert if needed
 *
 * @param {import('mongodb').Db} db   – The ShopHere database handle
 * @param {object} order              – The full order document (after status update)
 * @returns {object} { stockUpdated, alertCreated, alert? }
 */
async function onOrderReceived(db, order) {
  const { ObjectId, Int32 } = require("mongodb");

  const result = { stockUpdated: false, alertCreated: false, alert: null };

  if (order.orderStatus !== "Received") return result;

  const qtyReceived = order.quantityReceived || order.quantityOrdered;

  /* ── 1. Increment quantityInHand ───────────────────────── */
  const updateResult = await db.collection("items").findOneAndUpdate(
    { _id: order.itemId },
    { $inc: { quantityInHand: qtyReceived } },
    { returnDocument: "after" }
  );

  const updatedItem = updateResult.value || updateResult;
  if (!updatedItem) {
    console.warn("⚠  onOrderReceived: item not found for", order.itemId);
    return result;
  }
  result.stockUpdated = true;

  /* ── 2. Check reorder threshold ────────────────────────── */
  if (updatedItem.quantityInHand <= updatedItem.reorderLevel) {
    const alert = {
      itemId: updatedItem._id,
      itemName: updatedItem.itemName,
      currentStock: updatedItem.quantityInHand,
      reorderLevel: updatedItem.reorderLevel,
      reorderQuantity: updatedItem.reorderQuantity,
      alertDate: new Date(),
      resolved: false
    };
    await db.collection("reorderAlerts").insertOne(alert);
    result.alertCreated = true;
    result.alert = alert;
    console.log(`🔔  Reorder alert created for "${updatedItem.itemName}" (stock: ${updatedItem.quantityInHand})`);
  }

  return result;
}

module.exports = { onOrderReceived };
