import { GoogleGenerativeAI } from '@google/generative-ai'
import { GeminiParseResult } from '@/types'
import { appConfig } from '@/lib/config'

const genAI = new GoogleGenerativeAI(appConfig.google.apiKey!)

// Prompt template for parsing flyer images
const PARSE_PROMPT = `
You are an expert at analyzing retail store flyers and extracting individual product offers with MULTILINGUAL SUPPORT.

Analyze this flyer image and identify DISTINCT PRODUCTS based on the following visual criteria, extracting both English AND Macedonian text when present:

1. **VISUAL PRODUCT IDENTIFICATION**: Only extract products that have:
   - A clear product image/photo (not just text or logos)
   - Associated pricing information near the product image
   - A product name/title that corresponds to the visible product image

2. **COMBO/GROUP PRODUCTS**: When multiple related products share a single price:
   - Combine all product names with " + " separator
   - Add "(COMBO)" at the end of the product name
   - Example: "Ariel Powder + Ariel Liquid + Ariel Pods (COMBO)"
   - Use the group pricing for that single entry

3. **AVOID OVER-PARSING**: Do NOT extract:
   - Product names that are just part of category headers or navigation
   - Text-only mentions without corresponding product images
   - Brand names or product variations separated by "/" or other symbols that refer to the same visual product
   - Multiple entries for the same visual product shown in the image

4. **MACEDONIAN TEXT SUPPORT**: For comprehensive Macedonian market support:
   - Extract Macedonian product names when visible in Cyrillic script
   - **GENERATE Macedonian price text** based on numeric values (e.g., "12,99 ден" from 12.99 MKD)
   - **GENERATE Macedonian prefixes** when Macedonian product names are present
   - Include Macedonian promotional text when visible
   - Detect MKD currency (Macedonian Denars) alongside standard currencies
   - **Note**: Macedonian fields can be generated even if not visible in image for market completeness

Return a JSON array with this exact structure for each DISTINCT VISUAL PRODUCT:

[
  {
    "product_name": "Tasty Rubber Chicken",
    "product_name_mk": "Вкусен гумен пилешко",
    "product_name_prefixes": ["T", "Ta", "Tas", "Tast", "Tasty", "Tasty ", "Tasty R", "Tasty Ru", "Tasty Rub", "Tasty Rubb", "Tasty Rubbe", "Tasty Rubber", "Tasty Rubber ", "Tasty Rubber C", "Tasty Rubber Ch", "Tasty Rubber Chi", "Tasty Rubber Chic", "Tasty Rubber Chick", "Tasty Rubber Chicke", "Tasty Rubber Chicken"],
    "product_name_prefixes_mk": ["В", "Вк", "Вку", "Вкус", "Вкусе", "Вкусен", "Вкусен ", "Вкусен г", "Вкусен гу", "Вкусен гум", "Вкусен гуме", "Вкусен гумен", "Вкусен гумен ", "Вкусен гумен п", "Вкусен гумен пи", "Вкусен гумен пил", "Вкусен гумен пиле", "Вкусен гумен пилеш", "Вкусен гумен пилешк", "Вкусен гумен пилешко"],
    "discount_price": 12.99,
    "discount_price_mk": "12,99 ден",
    "discount_start_date": "2024-01-15",
    "discount_end_date": "2024-01-31",
    "old_price": 19.99,
    "old_price_mk": "19,99 ден",
    "currency": "USD",
    "additional_info": ["Brand name", "Size info", "Promotional text"],
    "additional_info_mk": ["Бренд", "Големина", "Промоција"]
  }
]

Schema requirements:
- product_name: string (required) - Product name that corresponds to a visible product image
- product_name_mk: string (optional) - Macedonian product name if present in Cyrillic
- product_name_prefixes: string[] (required) - Growing character prefixes of product_name, starting from first character and building up one character at a time until complete name
- product_name_prefixes_mk: string[] (optional) - Growing character prefixes of product_name_mk in Cyrillic, only if product_name_mk is present
- discount_price: number (optional) - Sale price if different from regular price
- discount_text: string (optional) - Raw discount text from flyer (e.g., "20% OFF", "SAVE $5")
- discount_price_mk: string (optional) - GENERATE Macedonian price text from numeric value (e.g., "12,99 ден")
- discount_start_date: string (optional) - ISO date string when discount starts (YYYY-MM-DD format)
- discount_end_date: string (optional) - ISO date string when discount ends (YYYY-MM-DD format)
- old_price: number (required) - Regular/original price
- old_price_mk: string (optional) - GENERATE Macedonian price text from numeric value (e.g., "19,99 ден")
- currency: string (required) - 3-letter currency code (USD, CAD, EUR, GBP, MKD, etc.)
- additional_info: string[] (optional) - Additional details like brand, size, or promo text
- additional_info_mk: string[] (optional) - Macedonian additional details

**CURRENCY DETECTION RULES**:
- Analyze price symbols and text to determine currency ($ = USD/CAD, € = EUR, £ = GBP, ден/MKD = Macedonian Denar, etc.)
- Look for currency indicators like "CAD", "USD", "€", "$", "£", "ден", "MKD"
- Macedonian Denars: Look for "ден", "денари", "MKD" or Cyrillic price text
- If multiple currencies detected, use the most prominent one
- Default to USD if currency is ambiguous and cannot be determined
- Return standard 3-letter ISO currency codes (USD, CAD, EUR, GBP, AUD, etc.)

**DISCOUNT DATE DETECTION RULES**:
- Look for discount validity dates on flyers (e.g., "Valid Jan 15-31", "До 28.01", "Sale ends March 15")
- Parse common date formats: "Jan 15-31", "15-31 Jan", "15.01-31.01", "January 15 - January 31"
- Convert to ISO format YYYY-MM-DD (e.g., "2024-01-15")
- Extract both start and end dates when available
- If only end date visible, leave start date empty
- If no specific dates found, leave both fields empty
- Handle multiple languages: English dates and Macedonian/Cyrillic date text

**MACEDONIAN PRICE TEXT GENERATION RULES**:
- **Always generate** discount_price_mk and old_price_mk when currency is detected or for market completeness
- **Format**: Use comma as decimal separator: "12,99 ден" (not "12.99 ден")
- **Currency symbols**: Use "ден" for MKD, "$" for USD, "€" for EUR, etc.
- **Examples**: 12.99 USD → "12,99 $" or 15.50 MKD → "15,50 ден"
- **Generate even if not visible**: Provide Macedonian price text for better market coverage

**CRITICAL RULES**:
- Only parse products with visible product images, not text-only mentions
- If a product title has no corresponding product image, skip it entirely
- For combo/group offers: combine product names with " + " and add "(COMBO)"
- **ONE JSON OBJECT PER DISTINCT VISUAL PRODUCT** - Even if multiple products share the same price, parse each variant separately
- **PRODUCT VARIANTS**: If you see 3 different flavors/varieties/sizes of the same product, create 3 separate entries
- **SHARED PRICING**: When multiple products have identical pricing, duplicate the price/discount data for each product
- Focus on actual retail products being sold, not category headers or brand logos
- Use precise numeric values for prices (12.99, not "$12.99")
- Always include currency code for each product based on visual currency indicators
- **RETURN ONLY VALID JSON** - NO comments, NO explanations, NO inline text - PURE JSON ONLY
- **NO TRAILING COMMAS** - Never put commas before closing brackets ] or braces } - Invalid: ["a", "b",] Valid: ["a", "b"]

**IF NO PRODUCTS CAN BE EXTRACTED**:
Return an error object with this exact format:
{
  "error": "NO_PRODUCTS_FOUND",
  "reason": "Brief explanation of why no products could be extracted"
}

**MULTIPLE VARIANTS WITH SHARED PRICING EXAMPLE** (parse each variant separately with ALL fields):
[
  {
    "product_name": "Vero Jam Strawberry 500g",
    "product_name_mk": "Веро Џем Јагода 500г",
    "product_name_prefixes": ["V", "Ve", "Ver", "Vero", "Vero ", "Vero J", "Vero Ja", "Vero Jam", "Vero Jam ", "Vero Jam S", "Vero Jam St", "Vero Jam Str", "Vero Jam Stra", "Vero Jam Straw", "Vero Jam Strawb", "Vero Jam Strawbe", "Vero Jam Strawber", "Vero Jam Strawberr", "Vero Jam Strawberry", "Vero Jam Strawberry ", "Vero Jam Strawberry 5", "Vero Jam Strawberry 50", "Vero Jam Strawberry 500", "Vero Jam Strawberry 500g"],
    "product_name_prefixes_mk": ["В", "Ве", "Вер", "Веро", "Веро ", "Веро Џ", "Веро Џе", "Веро Џем", "Веро Џем ", "Веро Џем Ј", "Веро Џем Ја", "Веро Џем Јаг", "Веро Џем Јаго", "Веро Џем Јагод", "Веро Џем Јагода", "Веро Џем Јагода ", "Веро Џем Јагода 5", "Веро Џем Јагода 50", "Веро Џем Јагода 500", "Веро Џем Јагода 500г"],
    "discount_price": 2.99,
    "discount_price_mk": "2,99 ден",
    "discount_start_date": "2024-01-15",
    "discount_end_date": "2024-01-31",
    "old_price": 4.99,
    "old_price_mk": "4,99 ден",
    "currency": "USD",
    "additional_info": ["500g jar", "Strawberry flavor"],
    "additional_info_mk": ["500г тегла", "Вкус на јагода"]
  },
  {
    "product_name": "Vero Jam Raspberry 500g",
    "product_name_mk": "Веро Џем Малина 500г",
    "product_name_prefixes": ["V", "Ve", "Ver", "Vero", "Vero ", "Vero J", "Vero Ja", "Vero Jam", "Vero Jam ", "Vero Jam R", "Vero Jam Ra", "Vero Jam Ras", "Vero Jam Rasp", "Vero Jam Raspb", "Vero Jam Raspbe", "Vero Jam Raspber", "Vero Jam Raspberr", "Vero Jam Raspberry", "Vero Jam Raspberry ", "Vero Jam Raspberry 5", "Vero Jam Raspberry 50", "Vero Jam Raspberry 500", "Vero Jam Raspberry 500g"],
    "product_name_prefixes_mk": ["В", "Ве", "Вер", "Веро", "Веро ", "Веро Џ", "Веро Џе", "Веро Џем", "Веро Џем ", "Веро Џем М", "Веро Џем Ма", "Веро Џем Мал", "Веро Џем Мали", "Веро Џем Малин", "Веро Џем Малина", "Веро Џем Малина ", "Веро Џем Малина 5", "Веро Џем Малина 50", "Веро Џем Малина 500", "Веро Џем Малина 500г"],
    "discount_price": 2.99,
    "discount_price_mk": "2,99 ден",
    "discount_start_date": "2024-01-15",
    "discount_end_date": "2024-01-31",
    "old_price": 4.99,
    "old_price_mk": "4,99 ден",
    "currency": "USD",
    "additional_info": ["500g jar", "Raspberry flavor"],
    "additional_info_mk": ["500г тегла", "Вкус на малина"]
  },
  {
    "product_name": "Vero Jam Apricot 500g",
    "product_name_mk": "Веро Џем Кајсија 500г",
    "product_name_prefixes": ["V", "Ve", "Ver", "Vero", "Vero ", "Vero J", "Vero Ja", "Vero Jam", "Vero Jam ", "Vero Jam A", "Vero Jam Ap", "Vero Jam Apr", "Vero Jam Apri", "Vero Jam Apric", "Vero Jam Aprico", "Vero Jam Apricot", "Vero Jam Apricot ", "Vero Jam Apricot 5", "Vero Jam Apricot 50", "Vero Jam Apricot 500", "Vero Jam Apricot 500g"],
    "product_name_prefixes_mk": ["В", "Ве", "Вер", "Веро", "Веро ", "Веро Џ", "Веро Џе", "Веро Џем", "Веро Џем ", "Веро Џем К", "Веро Џем Ка", "Веро Џем Кај", "Веро Џем Кајс", "Веро Џем Кајси", "Веро Џем Кајсиј", "Веро Џем Кајсија", "Веро Џем Кајсија ", "Веро Џем Кајсија 5", "Веро Џем Кајсија 50", "Веро Џем Кајсија 500", "Веро Џем Кајсија 500г"],
    "discount_price": 2.99,
    "discount_price_mk": "2,99 ден",
    "discount_start_date": "2024-01-15",
    "discount_end_date": "2024-01-31",
    "old_price": 4.99,
    "old_price_mk": "4,99 ден",
    "currency": "USD",
    "additional_info": ["500g jar", "Apricot flavor"],
    "additional_info_mk": ["500г тегла", "Вкус на кајсија"]
  }
]

**COMBO PRODUCT EXAMPLE** (must include ALL required fields):
[
  {
    "product_name": "Ariel Powder + Ariel Liquid + Ariel Pods (COMBO)",
    "product_name_mk": "Ариел Прав + Ариел Течен + Ариел Капсули (КОМБО)",
    "product_name_prefixes": ["A", "Ar", "Ari", "Arie", "Ariel", "Ariel ", "Ariel P", "Ariel Po", "Ariel Pow", "Ariel Powd", "Ariel Powde", "Ariel Powder", "Ariel Powder ", "Ariel Powder +", "Ariel Powder + ", "Ariel Powder + A", "Ariel Powder + Ar", "Ariel Powder + Ari", "Ariel Powder + Arie", "Ariel Powder + Ariel", "Ariel Powder + Ariel ", "Ariel Powder + Ariel L", "Ariel Powder + Ariel Li", "Ariel Powder + Ariel Liq", "Ariel Powder + Ariel Liqu", "Ariel Powder + Ariel Liqui", "Ariel Powder + Ariel Liquid", "Ariel Powder + Ariel Liquid ", "Ariel Powder + Ariel Liquid +", "Ariel Powder + Ariel Liquid + ", "Ariel Powder + Ariel Liquid + A", "Ariel Powder + Ariel Liquid + Ar", "Ariel Powder + Ariel Liquid + Ari", "Ariel Powder + Ariel Liquid + Arie", "Ariel Powder + Ariel Liquid + Ariel", "Ariel Powder + Ariel Liquid + Ariel ", "Ariel Powder + Ariel Liquid + Ariel P", "Ariel Powder + Ariel Liquid + Ariel Po", "Ariel Powder + Ariel Liquid + Ariel Pod", "Ariel Powder + Ariel Liquid + Ariel Pods", "Ariel Powder + Ariel Liquid + Ariel Pods ", "Ariel Powder + Ariel Liquid + Ariel Pods (", "Ariel Powder + Ariel Liquid + Ariel Pods (C", "Ariel Powder + Ariel Liquid + Ariel Pods (CO", "Ariel Powder + Ariel Liquid + Ariel Pods (COM", "Ariel Powder + Ariel Liquid + Ariel Pods (COMB", "Ariel Powder + Ariel Liquid + Ariel Pods (COMBO", "Ariel Powder + Ariel Liquid + Ariel Pods (COMBO)"],
    "product_name_prefixes_mk": ["А", "Ар", "Ари", "Арие", "Ариел", "Ариел ", "Ариел П", "Ариел Пр", "Ариел Пра", "Ариел Прав", "Ариел Прав ", "Ариел Прав +", "Ариел Прав + ", "Ариел Прав + А", "Ариел Прав + Ар", "Ариел Прав + Ари", "Ариел Прав + Арие", "Ариел Прав + Ариел", "Ариел Прав + Ариел ", "Ариел Прав + Ариел Т", "Ариел Прав + Ариел Те", "Ариел Прав + Ариел Теч", "Ариел Прав + Ариел Тече", "Ариел Прав + Ариел Течен", "Ариел Прав + Ариел Течен ", "Ариел Прав + Ариел Течен +", "Ариел Прав + Ариел Течен + ", "Ариел Прав + Ариел Течен + А", "Ариел Прав + Ариел Течен + Ар", "Ариел Прав + Ариел Течен + Ари", "Ариел Прав + Ариел Течен + Арие", "Ариел Прав + Ариел Течен + Ариел", "Ариел Прав + Ариел Течен + Ариел ", "Ариел Прав + Ариел Течен + Ариел К", "Ариел Прав + Ариел Течен + Ариел Ка", "Ариел Прав + Ариел Течен + Ариел Кап", "Ариел Прав + Ариел Течен + Ариел Капс", "Ариел Прав + Ариел Течен + Ариел Капсу", "Ариел Прав + Ариел Течен + Ариел Капсул", "Ариел Прав + Ариел Течен + Ариел Капсули", "Ариел Прав + Ариел Течен + Ариел Капсули ", "Ариел Прав + Ариел Течен + Ариел Капсули (", "Ариел Прав + Ариел Течен + Ариел Капсули (К", "Ариел Прав + Ариел Течен + Ариел Капсули (КО", "Ариел Прав + Ариел Течен + Ариел Капсули (КОМ", "Ариел Прав + Ариел Течен + Ариел Капсули (КОМБ", "Ариел Прав + Ариел Течен + Ариел Капсули (КОМБО", "Ариел Прав + Ариел Течен + Ариел Капсули (КОМБО)"],
    "discount_price": 15.99,
    "discount_price_mk": "15,99 ден",
    "discount_start_date": "2024-01-10",
    "discount_end_date": "2024-01-28",
    "old_price": 19.99,
    "old_price_mk": "19,99 ден",
    "currency": "USD",
    "additional_info": ["Multi-product offer", "Save on bundle"],
    "additional_info_mk": ["Повеќе-производна понуда", "Заштеди на пакет"]
  }
]

**POSSIBLE ERROR REASONS**:
- "NO_PRODUCTS_FOUND": No clear product images with pricing found
- "IMAGE_UNCLEAR": Image quality too poor to identify products
- "NO_PRICING": Products visible but no clear pricing information
- "NON_RETAIL": Image does not appear to be a retail flyer

Return valid JSON format only.
`

/**
 * Parse a flyer image using Google Gemini Pro 2.5
 */
export async function parseImageWithGemini(dataUrl: string): Promise<GeminiParseResult[]> {
  try {
    // Get Gemini model
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })

    // Convert data URL to the format expected by Gemini
    const base64Data = dataUrl.split(',')[1]
    const mimeType = dataUrl.split(';')[0].split(':')[1]

    if (!base64Data || !mimeType) {
      throw new Error('Invalid image data URL format')
    }

    // Generate content with image and prompt
    const result = await model.generateContent([
      PARSE_PROMPT,
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      },
    ])

    const response = await result.response
    const text = response.text()

    // Parse the JSON response
    let parsedData: GeminiParseResult[]
    
    try {
      console.log('🤖 Raw Gemini response length:', text.length)
      console.log('🔍 Raw response preview:', text.substring(0, 200) + '...')
      
      // Comprehensive JSON cleaning
      let cleanedText = text
        // Remove markdown code blocks
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        // Remove any text before the first [ or {
        .replace(/^[^\[\{]*/, '')
        // Remove any text after the last ] or }
        .replace(/[^\]\}]*$/, '')
        // Clean control characters that break JSON
        .replace(/[\x00-\x1F\x7F]/g, '')
        // Fix common AI response issues
        .replace(/\\n/g, '\\\\n')  // Fix newlines in strings
        .replace(/\\t/g, '\\\\t')  // Fix tabs in strings
        .replace(/\\r/g, '\\\\r')  // Fix carriage returns
        .replace(/"([^"]*?)\n([^"]*?)"/g, '"$1\\\\n$2"') // Fix unescaped newlines in strings
        // Remove trailing commas (critical for JSON validity)
        .replace(/,(\s*[\]\}])/g, '$1')  // Remove commas before ] or }
        .trim()
      
      console.log('✨ Cleaned text length:', cleanedText.length)
      console.log('🔍 Cleaned text preview:', cleanedText.substring(0, 200) + '...')
      
      // Additional safety check - ensure it starts with [ or {
      if (!cleanedText.startsWith('[') && !cleanedText.startsWith('{')) {
        throw new Error('Response does not appear to be valid JSON (no opening bracket/brace)')
      }
      
      parsedData = JSON.parse(cleanedText)
      
      // Check if it's an error object
      if (parsedData && typeof parsedData === 'object' && !Array.isArray(parsedData) && 'error' in parsedData) {
        const errorObj = parsedData as { error: string; reason?: string }
        const errorReason = `${errorObj.error}: ${errorObj.reason || 'No specific reason provided'}`
        throw new Error(errorReason)
      }
      
      // Ensure it's an array
      if (!Array.isArray(parsedData)) {
        parsedData = [parsedData]
      }
      
      // Validate the structure
      const validatedData = parsedData.map((item, index) => {
        if (!item.product_name || typeof item.product_name !== 'string') {
          throw new Error(`Invalid product_name for item ${index + 1}`)
        }
        
        // Enhanced old_price validation with string conversion
        if (item.old_price === undefined || item.old_price === null) {
          throw new Error(`Missing old_price for item ${index + 1}: received ${item.old_price}`)
        }
        
        // Convert string prices to numbers if possible
        let oldPrice = item.old_price
        if (typeof oldPrice === 'string') {
          console.log(`⚠️ Converting string price to number for item ${index + 1}: "${oldPrice}"`)  
          const parsed = parseFloat(oldPrice)
          if (isNaN(parsed) || parsed <= 0) {
            throw new Error(`Invalid old_price for item ${index + 1}: cannot convert "${oldPrice}" to valid number`)
          }
          oldPrice = parsed
        }
        
        if (typeof oldPrice !== 'number' || isNaN(oldPrice) || oldPrice <= 0) {
          throw new Error(`Invalid old_price for item ${index + 1}: received ${typeof oldPrice} - ${JSON.stringify(oldPrice)}`)
        }
        
        // Currency validation - required field
        if (!item.currency || typeof item.currency !== 'string') {
          throw new Error(`Invalid or missing currency for item ${index + 1}`)
        }
        
        // Enhanced discount_price validation with string conversion
        let discountPrice = item.discount_price
        if (discountPrice !== undefined) {
          if (typeof discountPrice === 'string') {
            console.log(`⚠️ Converting string discount price to number for item ${index + 1}: "${discountPrice}"`)  
            const parsed = parseFloat(discountPrice)
            if (isNaN(parsed) || parsed <= 0) {
              throw new Error(`Invalid discount_price for item ${index + 1}: cannot convert "${discountPrice}" to valid number`)
            }
            discountPrice = parsed
          }
          
          if (typeof discountPrice !== 'number' || isNaN(discountPrice) || discountPrice <= 0) {
            throw new Error(`Invalid discount_price for item ${index + 1}: received ${typeof discountPrice} - ${JSON.stringify(discountPrice)}`)
          }
        }
        
        // Optional additional_info validation
        if (item.additional_info !== undefined && !Array.isArray(item.additional_info)) {
          throw new Error(`Invalid additional_info for item ${index + 1}`)
        }
        
        // Optional Macedonian fields validation
        if (item.product_name_mk !== undefined && typeof item.product_name_mk !== 'string') {
          throw new Error(`Invalid product_name_mk for item ${index + 1}`)
        }
        if (item.discount_price_mk !== undefined && typeof item.discount_price_mk !== 'string') {
          throw new Error(`Invalid discount_price_mk for item ${index + 1}`)
        }
        if (item.old_price_mk !== undefined && typeof item.old_price_mk !== 'string') {
          throw new Error(`Invalid old_price_mk for item ${index + 1}`)
        }
        if (item.additional_info_mk !== undefined && !Array.isArray(item.additional_info_mk)) {
          throw new Error(`Invalid additional_info_mk for item ${index + 1}`)
        }
        if (item.product_name_prefixes_mk !== undefined && !Array.isArray(item.product_name_prefixes_mk)) {
          throw new Error(`Invalid product_name_prefixes_mk for item ${index + 1}`)
        }
        
        // Validate and generate prefixes
        if (!item.product_name_prefixes || !Array.isArray(item.product_name_prefixes)) {
          throw new Error(`Missing or invalid product_name_prefixes for item ${index + 1}`);
        }
        
        // Validate prefixes match the product name
        const fullName = item.product_name.trim();
        const expectedPrefixes = [];
        for (let i = 1; i <= fullName.length; i++) {
          expectedPrefixes.push(fullName.substring(0, i));
        }
        
        // Allow AI-generated prefixes but validate they make sense
        if (item.product_name_prefixes[item.product_name_prefixes.length - 1] !== fullName) {
          console.warn(`Prefix sequence doesn't end with full product name for item ${index + 1}, auto-generating`);
          item.product_name_prefixes = expectedPrefixes;
        }
        
        // Generate Macedonian prefixes if Macedonian name exists
        let macedonianPrefixes = undefined;
        if (item.product_name_mk) {
          const fullNameMk = item.product_name_mk.trim();
          if (item.product_name_prefixes_mk && Array.isArray(item.product_name_prefixes_mk)) {
            if (item.product_name_prefixes_mk[item.product_name_prefixes_mk.length - 1] !== fullNameMk) {
              console.warn(`Macedonian prefix sequence doesn't end with full product name for item ${index + 1}, auto-generating`);
              macedonianPrefixes = [];
              for (let i = 1; i <= fullNameMk.length; i++) {
                macedonianPrefixes.push(fullNameMk.substring(0, i));
              }
            } else {
              macedonianPrefixes = item.product_name_prefixes_mk;
            }
          } else {
            // Auto-generate if not provided
            macedonianPrefixes = [];
            for (let i = 1; i <= fullNameMk.length; i++) {
              macedonianPrefixes.push(fullNameMk.substring(0, i));
            }
          }
        }
        
        return {
          product_name: item.product_name.trim(),
          product_name_mk: item.product_name_mk?.trim(),
          product_name_prefixes: item.product_name_prefixes,
          product_name_prefixes_mk: macedonianPrefixes,
          discount_price: discountPrice,
          discount_price_mk: item.discount_price_mk?.trim(),
          old_price: oldPrice,
          old_price_mk: item.old_price_mk?.trim(),
          currency: item.currency.toUpperCase(), // Normalize to uppercase
          additional_info: item.additional_info || [],
          additional_info_mk: item.additional_info_mk || [],
        }
      })
      
      return validatedData
      
    } catch (parseError: any) {
      console.error('❌ JSON parsing error:', parseError.message)
      console.error('🔴 Raw response (first 1000 chars):', text.substring(0, 1000))
      console.error('🔴 Error position:', parseError.message.match(/position (\d+)/) ? parseError.message.match(/position (\d+)/)[1] : 'unknown')
      
      // Show problematic area if position is available
      const positionMatch = parseError.message.match(/position (\d+)/)
      if (positionMatch) {
        const position = parseInt(positionMatch[1])
        const start = Math.max(0, position - 50)
        const end = Math.min(text.length, position + 50)
        console.error('📍 Problematic area:', text.substring(start, end))
        console.error('🖺 Character codes around error:', Array.from(text.substring(position - 5, position + 5)).map(c => c.charCodeAt(0)))
      }
      
      throw new Error(`Failed to parse AI response: ${parseError.message}. Check server logs for full response details.`)
    }

  } catch (error: any) {
    console.error('Gemini AI parsing error:', error)
    
    if (error.message?.includes('API key')) {
      throw new Error('Invalid Google AI API key')
    } else if (error.message?.includes('quota')) {
      throw new Error('Google AI API quota exceeded')
    } else if (error.message?.includes('safety')) {
      throw new Error('Image content flagged by safety filters')
    } else {
      throw new Error(`AI parsing failed: ${error.message}`)
    }
  }
}

/**
 * Test function to validate Gemini AI setup
 */
export async function testGeminiConnection(): Promise<boolean> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })
    const result = await model.generateContent(['Say "Hello" if you can read this.'])
    const response = await result.response
    const text = response.text()
    
    return text.toLowerCase().includes('hello')
  } catch (error) {
    console.error('Gemini connection test failed:', error)
    return false
  }
}

/**
 * Get available Gemini models
 */
export async function getAvailableModels(): Promise<string[]> {
  try {
    // This is a placeholder - the actual API might have different methods
    return ['gemini-1.5-pro', 'gemini-1.5-flash']
  } catch (error) {
    console.error('Failed to get available models:', error)
    return []
  }
}
