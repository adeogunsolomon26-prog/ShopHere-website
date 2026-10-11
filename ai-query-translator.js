/**
 * ShopHere - Natural Language to MongoDB MQL Query Translator
 * Supports:
 * 1. Free Cloud AI (Pollinations.ai API - Zero API key required, public endpoint)
 * 2. Deterministic Local Smart NLP Compiler (Instant 0ms fallback, completely offline, zero external dependency)
 * 
 * Schema aligned with ShopHere MongoDB Atlas cluster:
 * - items: { itemName, unitPrice, quantityInHand, reorderLevel, reorderQuantity, categoryId, supplierId }
 * - orders: { itemId, quantityOrdered, orderDate, orderStatus ("InTransit"|"Received"|"Cancelled"), receivingDate, quantityReceived, employeeId }
 * - categories: { categoryName ("Household"|"Sports"|"Accessories"|"Clothing") }
 * - suppliers: { supplierName, phone, email, address }
 * - employees: { firstName, lastName, phone, email, role, hireDate }
 * - reorderAlerts: { itemId, currentStock, reorderLevel, alertDate, status }
 * - users: { username, role ("guest"|"staff"|"superadmin"), displayName, active }
 */

const SCHEMA_SPEC = `Database: ShopHere
Exact Collections and fields in MongoDB Atlas:
1. items: { itemName: string, unitPrice: double (in Naira ₦), quantityInHand: int (stock), reorderLevel: int, reorderQuantity: int, categoryId: ObjectId, supplierId: ObjectId }
2. orders: { itemId: ObjectId, quantityOrdered: int, orderDate: Date, orderStatus: "InTransit"|"Received"|"Cancelled", receivingDate: Date|null, quantityReceived: int|null, employeeId: ObjectId }
3. categories: { categoryName: "Household"|"Sports"|"Accessories"|"Clothing" }
4. suppliers: { supplierName: string, phone: string, email: string, address: string }
5. employees: { firstName: string, lastName: string, phone: string, email: string, role: string, hireDate: Date }
6. reorderAlerts: { itemId: ObjectId, currentStock: int, reorderLevel: int, alertDate: Date, status: "Triggered"|"Acknowledged"|"Resolved" }
7. users: { username: string, role: "guest"|"staff"|"superadmin", displayName: string, active: boolean }`;

function sanitizeAndParseJSON(rawText) {
  let cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  // Sanitize invalid backslash dollar signs in JSON string values (\$)
  cleaned = cleaned.replace(/\\([$])/g, '$1');
  return JSON.parse(cleaned);
}

function buildMongoshCommand(parsed) {
  const col = parsed.collection || 'items';
  const op = parsed.operation || 'find';
  let cmd = `use ShopHere;\n`;

  if (op === 'aggregate') {
    const pipelineStr = JSON.stringify(parsed.pipeline || [], null, 2);
    cmd += `db.${col}.aggregate(${pipelineStr}).pretty();`;
  } else if (op === 'count') {
    const filterStr = JSON.stringify(parsed.filter || {}, null, 2);
    cmd += `db.${col}.countDocuments(${filterStr});`;
  } else if (op === 'explain') {
    const filterStr = JSON.stringify(parsed.filter || {}, null, 2);
    cmd += `db.${col}.find(${filterStr}).explain("executionStats");`;
  } else {
    // find
    const filterStr = JSON.stringify(parsed.filter || {}, null, 2);
    let s = `db.${col}.find(${filterStr})`;
    if (parsed.projection && Object.keys(parsed.projection).length > 0) {
      s += `, ${JSON.stringify(parsed.projection)}`;
    }
    if (parsed.sort && Object.keys(parsed.sort).length > 0) {
      s += `.sort(${JSON.stringify(parsed.sort)})`;
    }
    if (parsed.limit) {
      s += `.limit(${parsed.limit})`;
    }
    cmd += `${s}.pretty();`;
  }
  return cmd;
}

/**
 * Local Deterministic Natural Language MQL Compiler
 */
function parseNaturalLanguageLocal(prompt) {
  const p = prompt.trim().toLowerCase();

  // 1. Determine collection
  let collection = 'items';
  if ((p.includes('order') || p.includes('sale') || p.includes('revenue') || p.includes('intake') || p.includes('receiving')) && !p.includes('reorder')) {
    collection = 'orders';
  } else if (p.includes('supplier') || p.includes('vendor')) {
    if (p.includes('group by supplier') || (p.includes('by supplier') && (p.includes('stock') || p.includes('item') || p.includes('valuation')))) {
      collection = 'items';
    } else {
      collection = 'suppliers';
    }
  } else if (p.includes('employee') || (p.includes('staff') && !p.includes('revenue') && !p.includes('sales'))) {
    collection = 'employees';
  } else if (p.includes('categor') && !p.includes('item') && !p.includes('product') && !p.includes('stock') && !p.includes('valuation')) {
    collection = 'categories';
  } else if (p.includes('alert') || p.includes('trigger')) {
    collection = 'reorderAlerts';
  } else if (p.includes('user') || p.includes('account') || p.includes('login') || p.includes('clearance')) {
    collection = 'users';
  } else {
    collection = 'items';
  }

  // 2. Determine operation
  let operation = 'find';
  if (p.includes('group') || p.includes('sum') || p.includes('total') || p.includes('average') || p.includes('avg') || p.includes('breakdown') || p.includes('valuation') || p.includes('revenue')) {
    operation = 'aggregate';
  } else if (p.startsWith('count') || p.includes('how many') || p.includes('number of')) {
    operation = 'count';
  } else if (p.includes('explain') || p.includes('execution stats') || p.includes('index scan') || p.includes('performance')) {
    operation = 'explain';
  }

  let filter = {};
  let pipeline = [];
  let sort = {};
  let limit = 25;
  let explanation = '';

  // Extract custom limit
  const limitMatch = p.match(/top\s+(\d+)|limit\s+(\d+)|first\s+(\d+)/);
  if (limitMatch) {
    limit = parseInt(limitMatch[1] || limitMatch[2] || limitMatch[3], 10);
  }

  // ══════════════════════════════════════════════════════════
  // A. ORDERS AGGREGATION & QUERIES
  // ══════════════════════════════════════════════════════════
  if (collection === 'orders') {
    if (operation === 'aggregate') {
      if (p.includes('staff') || p.includes('employee') || p.includes('handler')) {
        pipeline = [
          { $match: { orderStatus: { $ne: 'Cancelled' } } },
          { $lookup: { from: 'items', localField: 'itemId', foreignField: '_id', as: 'item' } },
          { $unwind: '$item' },
          { $lookup: { from: 'employees', localField: 'employeeId', foreignField: '_id', as: 'emp' } },
          { $unwind: '$emp' },
          {
            $group: {
              _id: { $concat: ['$emp.firstName', ' ', '$emp.lastName'] },
              totalRevenue: { $sum: { $multiply: ['$quantityOrdered', '$item.unitPrice'] } },
              orderCount: { $sum: 1 }
            }
          },
          { $sort: { totalRevenue: -1 } },
          { $limit: limit }
        ];
        explanation = 'Aggregates sales revenue in ₦ and order volume grouped by staff member';
      } else if (p.includes('status')) {
        pipeline = [
          { $group: { _id: '$orderStatus', orderCount: { $sum: 1 }, totalUnits: { $sum: '$quantityOrdered' } } },
          { $sort: { orderCount: -1 } }
        ];
        explanation = 'Groups purchase and intake orders by fulfillment status';
      } else {
        pipeline = [
          { $match: { orderStatus: { $ne: 'Cancelled' } } },
          { $lookup: { from: 'items', localField: 'itemId', foreignField: '_id', as: 'item' } },
          { $unwind: '$item' },
          {
            $group: {
              _id: null,
              totalVolume: { $sum: '$quantityOrdered' },
              totalOrderCount: { $sum: 1 },
              totalEstimatedValue: { $sum: { $multiply: ['$quantityOrdered', '$item.unitPrice'] } }
            }
          }
        ];
        explanation = 'Calculates total store order volume and estimated monetary value in ₦';
      }
    } else {
      // Orders find / count / explain
      if (p.includes('intransit') || p.includes('transit') || p.includes('pending')) {
        filter.orderStatus = 'InTransit';
      } else if (p.includes('received') || p.includes('fulfilled')) {
        filter.orderStatus = 'Received';
      } else if (p.includes('cancelled')) {
        filter.orderStatus = 'Cancelled';
      }

      sort = { orderDate: -1 };
      explanation = `Queries orders collection filtered by ${JSON.stringify(filter)} sorted newest first`;
    }
  }

  // ══════════════════════════════════════════════════════════
  // B. ITEMS AGGREGATION & QUERIES
  // ══════════════════════════════════════════════════════════
  else if (collection === 'items') {
    if (operation === 'aggregate') {
      if (p.includes('categor')) {
        pipeline = [
          { $lookup: { from: 'categories', localField: 'categoryId', foreignField: '_id', as: 'cat' } },
          { $unwind: '$cat' },
          {
            $group: {
              _id: '$cat.categoryName',
              totalValuation: { $sum: { $multiply: ['$unitPrice', '$quantityInHand'] } },
              totalStockUnits: { $sum: '$quantityInHand' },
              itemCount: { $sum: 1 }
            }
          },
          { $sort: { totalValuation: -1 } },
          { $limit: limit }
        ];
        explanation = 'Calculates total inventory asset valuation in ₦ and stock volume grouped by category';
      } else if (p.includes('supplier') || p.includes('vendor')) {
        pipeline = [
          { $lookup: { from: 'suppliers', localField: 'supplierId', foreignField: '_id', as: 'supp' } },
          { $unwind: '$supp' },
          {
            $group: {
              _id: '$supp.supplierName',
              totalValuation: { $sum: { $multiply: ['$unitPrice', '$quantityInHand'] } },
              itemCount: { $sum: 1 }
            }
          },
          { $sort: { totalValuation: -1 } },
          { $limit: limit }
        ];
        explanation = 'Calculates inventory stock valuation in ₦ grouped by vendor supplier';
      } else {
        pipeline = [
          {
            $group: {
              _id: null,
              totalAssetValuation: { $sum: { $multiply: ['$unitPrice', '$quantityInHand'] } },
              totalUnitsInStock: { $sum: '$quantityInHand' },
              totalSkus: { $sum: 1 }
            }
          }
        ];
        explanation = 'Calculates overall warehouse asset valuation in ₦ and total stock units in hand';
      }
    } else {
      // Items find / count / explain
      const stockLess = p.match(/stock\s*(?:is\s*)?(?:less than|<|below|under)\s*(\d+)/) || p.match(/(?:less than|<|below|under)\s*(\d+)\s*stock/);
      const stockGreater = p.match(/stock\s*(?:is\s*)?(?:greater than|>|above|over|more than)\s*(\d+)/) || p.match(/(?:greater than|>|above|over|more than)\s*(\d+)\s*stock/);
      const lowStock = p.includes('low stock') || p.includes('critical stock') || p.includes('out of stock') || p.includes('reorder');

      const priceGreater = p.match(/price\s*(?:is\s*)?(?:greater than|>|above|over|more than)\s*(?:₦|ngn)?\s*(\d+)/) || p.match(/(?:cost|worth|price)\s*(?:>|above|over)\s*(\d+)/);
      const priceLess = p.match(/price\s*(?:is\s*)?(?:less than|<|below|under)\s*(?:₦|ngn)?\s*(\d+)/);

      if (stockLess) {
        filter.quantityInHand = { $lt: parseInt(stockLess[1], 10) };
      } else if (stockGreater) {
        filter.quantityInHand = { $gt: parseInt(stockGreater[1], 10) };
      } else if (lowStock) {
        filter.$expr = { $lte: ['$quantityInHand', '$reorderLevel'] };
      }

      if (priceGreater) {
        filter.unitPrice = { ...(filter.unitPrice || {}), $gt: parseFloat(priceGreater[1]) };
      }
      if (priceLess) {
        filter.unitPrice = { ...(filter.unitPrice || {}), $lt: parseFloat(priceLess[1]) };
      }

      // Sorting
      if (p.includes('price desc') || p.includes('most expensive') || p.includes('highest price') || p.includes('price descending')) {
        sort = { unitPrice: -1 };
      } else if (p.includes('cheapest') || p.includes('lowest price') || p.includes('price asc')) {
        sort = { unitPrice: 1 };
      } else if (p.includes('lowest stock') || p.includes('least stock')) {
        sort = { quantityInHand: 1 };
      } else if (p.includes('highest stock') || p.includes('most stock')) {
        sort = { quantityInHand: -1 };
      }

      explanation = `Filters catalog items matching ${JSON.stringify(filter)}`;
    }
  }

  // ══════════════════════════════════════════════════════════
  // C. SUPPLIERS
  // ══════════════════════════════════════════════════════════
  else if (collection === 'suppliers') {
    const locMatch = p.match(/(?:in|from)\s+([a-zA-Z]+)/);
    if (locMatch) {
      const loc = locMatch[1].trim();
      filter.$or = [
        { address: { $regex: loc, $options: 'i' } },
        { supplierName: { $regex: loc, $options: 'i' } }
      ];
    }
    explanation = 'Retrieves suppliers directory records';
  }

  // ══════════════════════════════════════════════════════════
  // D. EMPLOYEES
  // ══════════════════════════════════════════════════════════
  else if (collection === 'employees') {
    if (p.includes('manager')) filter.role = { $regex: 'manager', $options: 'i' };
    else if (p.includes('cashier')) filter.role = { $regex: 'cashier', $options: 'i' };
    else if (p.includes('warehouse')) filter.role = { $regex: 'warehouse', $options: 'i' };
    explanation = 'Queries staff directory records';
  }

  // ══════════════════════════════════════════════════════════
  // E. USERS
  // ══════════════════════════════════════════════════════════
  else if (collection === 'users') {
    if (p.includes('active')) filter.active = true;
    if (p.includes('staff')) filter.role = 'staff';
    if (p.includes('superadmin') || p.includes('admin')) filter.role = 'superadmin';
    explanation = 'Queries system user clearance and credentials';
  }

  // ══════════════════════════════════════════════════════════
  // F. REORDER ALERTS & CATEGORIES
  // ══════════════════════════════════════════════════════════
  else if (collection === 'reorderAlerts') {
    explanation = 'Fetches triggered inventory stock reorder alerts';
  } else if (collection === 'categories') {
    explanation = 'Lists product taxonomy category records';
  }

  const result = {
    collection,
    operation,
    filter,
    pipeline,
    sort,
    limit,
    explanation: explanation || `Query on ${collection} collection based on natural language prompt.`
  };
  result.mongoshCommand = buildMongoshCommand(result);
  return result;
}

/**
 * Main Translation Function
 * Calls Free Cloud AI first (Pollinations API - No key needed)
 * Seamlessly falls back to Local NLP Compiler if Cloud AI times out or errors
 */
async function translateNaturalLanguageQuery(prompt, options = {}) {
  const startTime = Date.now();
  const forceEngine = options.forceEngine || 'auto'; // 'auto' | 'cloud' | 'local'
  const timeoutMs = options.timeoutMs || 6500;
  const targetEndpoint = options.customEndpoint || 'https://text.pollinations.ai/';

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('Please enter a natural language query.');
  }

  const cleanPrompt = prompt.trim();

  // If local engine requested directly
  if (forceEngine === 'local') {
    const localResult = parseNaturalLanguageLocal(cleanPrompt);
    return {
      success: true,
      engine: 'ShopHere Local Smart NLP (Instant • 0ms • Offline)',
      latencyMs: Date.now() - startTime,
      prompt: cleanPrompt,
      ...localResult
    };
  }

  // Attempt Free Cloud AI / Public Endpoint (Zero API key required)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const sys = `You are an expert MongoDB MQL query generator for the ShopHere retail management system.
${SCHEMA_SPEC}

Translate the user's natural language request into a valid MongoDB query.
Notice the exact schema field names:
- items: itemName, unitPrice, quantityInHand, reorderLevel, reorderQuantity, categoryId, supplierId
- orders: itemId, quantityOrdered, orderDate, orderStatus, employeeId
- employees: firstName, lastName, phone, email, role
- suppliers: supplierName, phone, email, address

You MUST output ONLY a valid raw JSON object with NO markdown backticks, NO markdown syntax, and NO commentary:
{
  "collection": "items" | "orders" | "suppliers" | "employees" | "categories" | "users" | "reorderAlerts",
  "operation": "find" | "aggregate" | "count" | "explain",
  "filter": {},
  "pipeline": [],
  "sort": {},
  "limit": 25,
  "explanation": "Brief explanation of what this query does"
}
Rules:
- For find: populate "filter" (e.g. {"quantityInHand": {"$lt": 10}}) and optional "sort" (e.g. {"unitPrice": -1}).
- For aggregate: populate "pipeline" array with stages like $lookup, $unwind, $group, $sort.
- Use Naira ₦ currency for monetary calculations.
- Always pick the correct collection.`;

    const requestPayload = {
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: cleanPrompt }
      ],
      model: options.model || 'openai-fast'
    };

    const response = await fetch(targetEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const rawText = await response.text();
      let textToParse = rawText;
      try {
        const jsonWrapper = JSON.parse(rawText);
        if (jsonWrapper.choices && jsonWrapper.choices[0] && jsonWrapper.choices[0].message) {
          textToParse = jsonWrapper.choices[0].message.content;
        }
      } catch (ignore) {}

      const parsed = sanitizeAndParseJSON(textToParse);

      const validCols = ['items', 'orders', 'suppliers', 'employees', 'categories', 'users', 'reorderAlerts'];
      const validOps = ['find', 'aggregate', 'count', 'explain'];

      const collection = validCols.includes(parsed.collection) ? parsed.collection : 'items';
      const operation = validOps.includes(parsed.operation) ? parsed.operation : 'find';
      const filter = typeof parsed.filter === 'object' && parsed.filter !== null ? parsed.filter : {};
      const pipeline = Array.isArray(parsed.pipeline) ? parsed.pipeline : [];
      const sort = typeof parsed.sort === 'object' && parsed.sort !== null ? parsed.sort : {};
      const limit = Math.min(Math.max(1, parseInt(parsed.limit) || 25), 100);
      const explanation = parsed.explanation || `Query on ${collection}`;

      const finalObj = {
        collection,
        operation,
        filter,
        pipeline,
        sort,
        limit,
        explanation
      };
      finalObj.mongoshCommand = buildMongoshCommand(finalObj);

      const engineName = options.customEndpoint ? `Free Custom AI Endpoint (${targetEndpoint})` : 'Free Cloud AI (Pollinations API • No Key Required)';

      return {
        success: true,
        engine: engineName,
        latencyMs: Date.now() - startTime,
        prompt: cleanPrompt,
        ...finalObj
      };
    }
  } catch (err) {
    console.warn(`[AI Query Translator] Cloud AI unavailable (${err.message}), falling back to Local NLP engine.`);
  }

  // Fallback: Local NLP Compiler
  const localResult = parseNaturalLanguageLocal(cleanPrompt);
  return {
    success: true,
    engine: 'ShopHere Local Smart NLP (Instant • 0ms • Offline)',
    latencyMs: Date.now() - startTime,
    fallbackTriggered: true,
    prompt: cleanPrompt,
    ...localResult
  };
}

module.exports = {
  translateNaturalLanguageQuery,
  parseNaturalLanguageLocal,
  buildMongoshCommand
};
