# Truplexy — Tools, Catalog and Customers

## What are custom tools?
Custom tools let the assistant look things up or act in your own systems. A tool is an HTTP API call with parameters the assistant fills in. Developers add them in the dashboard under Tools. Custom tools are on every plan.

## How many tool calls can one reply make?
A reply can make at most 4 rounds of up to 5 tool calls. Each call has a 10-second timeout.

## What built-in tools are there?
Read-only tools for Shopify and WooCommerce: order status and product search. They only appear under Tools when the store is connected. They are off until you turn them on.

## Does the assistant have web search?
Web search for the AI agent is listed on the pricing page for Pro and Enterprise. Check https://truplexy.com/pricing for the current plan listing. When it is on, the assistant searches the web only where its knowledge base lacks a confident answer, and queries are scrubbed of emails, IP addresses and long numbers.

## What is the product catalog?
Products hold names, prices and stock. You can import them from a CSV, a document or a shop page. The assistant uses product search to answer questions about them once product search is turned on under Tools.

## What are queries?
Queries are structured requests, such as payments or deliveries, with their own forms and statuses. The assistant can open a query for a customer and report that customer's own query status. It never shows another customer's.

## How does Truplexy handle customers?
Each customer has one history across channels, with multiple contacts such as email or phone. The same person writing on Instagram and by email is matched through their contacts.

## What are properties?
Properties are custom fields on customers, set under Settings → Properties. A property can be marked sensitive, which hides it from read-only teammates and from the assistant.

## Can the assistant see order details for anyone who asks?
No. Order lookups work for signed-in customers, with the permissions you approved when you connected the store.
