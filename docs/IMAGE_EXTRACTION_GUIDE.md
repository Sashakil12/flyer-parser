# 🍌 Flyer Image Extraction System (Nano Banana)

## Overview

The Flyer Image Extraction System is a robust, AI-powered pipeline that extracts clean, professional product images from flyer images using Google's **Nano Banana** (Gemini 2.5 Flash Image Preview) model. It runs in parallel with the existing flyer parsing workflow and produces Flutter-optimized images suitable for ecommerce applications.

**🚀 UPGRADED TO NANO BANANA**: This system now uses Google's latest Nano Banana model, which provides superior performance with 5-10x faster processing, better background removal, and enhanced e-commerce optimization compared to the previous Imagen 4 implementation.

## Architecture

### Workflow Pipeline

```
Flyer Upload → Parse with Gemini → Trigger Image Extraction (Parallel)
                                 ↓
                    Extract Clean Product Images (Nano Banana)
                                 ↓
                    Optimize for Flutter (Sharp)
                                 ↓
                    Upload to Firebase Storage
                                 ↓
                    Update Database with URLs
```

### Key Components

1. **Nano Banana Service** (`src/lib/nano-banana-advanced.ts`)
   - Natural language-driven product extraction
   - Superior background removal and text elimination
   - Professional e-commerce image generation
   - Ultra-fast processing (1-2 seconds vs 10-15 seconds)

2. **Image Optimization** (`src/lib/image-optimization.ts`)
   - Flutter-specific optimizations
   - Multi-resolution generation (1x, 2x, 3x)
   - WebP conversion for optimal mobile performance
   - Quality validation

3. **Storage Management** (`src/lib/storage-images.ts`)
   - Organized Firebase Storage structure
   - Metadata management
   - Public URL generation

4. **Inngest Function** (`src/lib/inngest/functions.ts`)
   - `extractImagesFunction` - Main extraction pipeline
   - Parallel processing with error handling
   - Database updates with extraction results

## Features

### ✨ Clean Image Extraction (Nano Banana Powered)
- **Superior Background Removal**: Advanced AI removes flyer backgrounds and replaces with clean white backgrounds
- **Intelligent Text Removal**: Natural language understanding eliminates promotional text, price tags, and discount badges
- **Professional Styling**: Adds subtle shadows and centers products with studio-quality lighting
- **Quality Enhancement**: Improves colors, sharpness, and overall quality with one-shot processing

### 📱 Flutter Optimization
- **WebP Format**: Optimal compression for mobile apps
- **Multiple Resolutions**: 1x (400px), 2x (800px), 3x (1200px) for different screen densities, plus custom 828x440px resolution
- **Thumbnail Generation**: Small thumbnails for list views
- **Progressive Loading**: Blur placeholders for smooth UX

### 🔧 Robust Processing
- **Ultra-Fast Processing**: Nano Banana processes images in 1-2 seconds (5-10x faster than previous models)
- **Quality Validation**: Automatic quality scoring and manual review flagging
- **Error Handling**: Graceful degradation with detailed error reporting
- **Parallel Processing**: Independent processing per product item with reduced rate limiting

## Configuration

### Environment Variables

Add to your `.env.local`:

```bash
# Google AI (for Nano Banana - Gemini 2.5 Flash Image Preview)
GOOGLE_AI_API_KEY=your-gemini-api-key

# Existing variables
INNGEST_EVENT_KEY=your-inngest-key

# Note: No longer requires Google Cloud credentials since Nano Banana uses the Gemini API directly
```

### Google AI Setup

1. **Get API Key**:
   - Visit [Google AI Studio](https://aistudio.google.com/)
   - Generate a new API key for Gemini
   - Add it to your `.env.local` as `GOOGLE_AI_API_KEY`

2. **Model Access**:
   - Nano Banana (Gemini 2.5 Flash Image Preview) is available through the standard Gemini API
   - No additional service account or Google Cloud setup required

## Database Schema

### ParsedFlyerItem Updates

```typescript
interface ParsedFlyerItem {
  // ... existing fields
  
  // New image extraction fields
  extractedImages?: {
    clean: {
      original: string          // High-quality clean image
      optimized: string         // WebP optimized for Flutter
      thumbnail: string         // Small thumbnail
      transparent?: string      // Transparent background version
    }
    resolutions: {
      '1x': string             // 400x400 baseline
      '2x': string             // 800x800 high DPI
      '3x': string             // 1200x1200 extra high DPI
      'custom': string         // 828x440 custom resolution
    }
    extractionMetadata: {
      confidence: number        // AI confidence (0-1)
      backgroundRemoved: boolean
      textRemoved: boolean
      qualityScore: number      // Quality score (0-1)
      processingMethod: 'nano-banana' | 'imagen4' | 'vision-api' | 'fallback'
      manualReviewRequired: boolean
    }
  }
  imageExtractionStatus?: 'pending' | 'processing' | 'completed' | 'failed' | 'manual-review'
  imageExtractionError?: string
  imageExtractedAt?: Timestamp
  imageQualityScore?: number
}
```

## Storage Structure

```
/flyer-images/
  /{flyerImageId}/
    /extracted/
      /{parsedItemId}/
        /clean/
          /original.webp          # High-quality clean image
          /optimized.webp         # Mobile-optimized
          /thumbnail.webp         # Thumbnail
          /transparent.webp       # Transparent background
        /resolutions/
          /1x.webp               # 400x400
          /2x.webp               # 800x800  
          /3x.webp               # 1200x1200
          /custom.webp           # 828x440 custom resolution
        /metadata.json           # Extraction metadata
```

## Usage

### Triggering Image Extraction

The system automatically triggers image extraction after flyer parsing completes. You can also trigger it manually:

```typescript
await inngest.send({
  name: 'flyer/extract-images',
  data: {
    flyerImageId: 'flyer-123',
    storageUrl: 'https://storage.url/flyer.jpg',
    originalImageDimensions: { width: 1920, height: 1080 },
    parsedItems: [
      {
        id: 'item-123',
        productName: 'Product Name',
        productNameMk: 'Македонско име',
        discountPrice: 199,
        oldPrice: 299,
        additionalInfo: ['Additional info']
      }
    ]
  }
})
```

### Accessing Extracted Images

```typescript
// Get parsed item with extracted images
const parsedItem = await getParsedFlyerItem(itemId)

if (parsedItem.extractedImages) {
  const optimizedUrl = parsedItem.extractedImages.clean.optimized
  const thumbnailUrl = parsedItem.extractedImages.clean.thumbnail
  const highDpiUrl = parsedItem.extractedImages.resolutions['2x']
  const customUrl = parsedItem.extractedImages.resolutions['custom'] // 828x440px
}
```

## Monitoring

### Status Tracking

Monitor extraction progress through the `imageExtractionStatus` field:

- `pending` - Queued for processing
- `processing` - Currently being processed
- `completed` - Successfully completed
- `failed` - Processing failed
- `manual-review` - Requires manual review due to quality issues

### Quality Metrics

- **Confidence Score**: AI confidence in extraction accuracy (0-1)
- **Quality Score**: Overall image quality assessment (0-1)
- **Manual Review Flag**: Indicates if human review is recommended

### Error Handling

Check `imageExtractionError` field for detailed error messages:

```typescript
if (parsedItem.imageExtractionStatus === 'failed') {
  console.error('Extraction failed:', parsedItem.imageExtractionError)
}
```

## Performance Considerations

### Optimization Strategies

1. **Parallel Processing**: Each product processed independently
2. **Caching**: Avoid reprocessing similar products
3. **Rate Limiting**: Respect Imagen 4 API limits
4. **Quality Gates**: Skip low-quality extractions

### Resource Management

- **Memory**: Sharp operations are memory-intensive
- **Storage**: WebP provides ~30% size reduction vs JPEG
- **Bandwidth**: CDN delivery for Flutter apps

## Troubleshooting

### Common Issues

1. **Imagen 4 API Errors**
   - Check Google Cloud credentials
   - Verify API quotas and limits
   - Ensure proper IAM permissions

2. **Image Quality Issues**
   - Review extraction confidence scores
   - Check manual review flags
   - Validate input flyer quality

3. **Storage Upload Failures**
   - Verify Firebase Storage permissions
   - Check storage bucket configuration
   - Monitor storage quotas

### Debug Logging

Enable detailed logging by setting:

```bash
NODE_ENV=development
```

Look for these log patterns:
- `🎨 INNGEST IMAGE EXTRACTION TRIGGERED`
- `🤖 Extracting clean product images`
- `✅ Successfully processed image`
- `❌ Error processing image`

## Future Enhancements

### Planned Features

1. **Smart Cropping**: AI-powered product boundary detection
2. **Background Styles**: Multiple background options (gradient, transparent)
3. **Batch Processing**: Optimize multiple items simultaneously
4. **A/B Testing**: Compare extraction methods
5. **Manual Review UI**: Interface for quality control

### Integration Opportunities

1. **Flutter App**: Direct image consumption
2. **Admin Dashboard**: Extraction monitoring
3. **Analytics**: Quality metrics tracking
4. **Webhooks**: Real-time extraction notifications

## Support

For issues or questions:

1. Check the console logs for detailed error messages
2. Review the extraction metadata for quality insights
3. Monitor the Inngest dashboard for function execution
4. Verify Google Cloud API quotas and permissions

The system is designed to be robust and self-healing, with automatic fallbacks and detailed error reporting to ensure reliable image extraction for your Flutter ecommerce application.
