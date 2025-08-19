# Product Update Script

This script updates the product with ID `00GAOMXjQNgFXhjef5NA` in the Firestore database with correct translations and keywords.

## Prerequisites

1. You need a Firebase service account key file to authenticate with Firebase Admin SDK.
2. Node.js installed on your machine.

## Setup

1. Place your Firebase service account key file in the root directory and name it `service-account-key.json`
   - You can download this from Firebase Console > Project Settings > Service Accounts > Generate new private key

2. Install the required dependencies:
   ```
   npm install firebase-admin
   ```

## Running the Script

Execute the script with:

```
node update-product.js
```

## What the Script Does

This script fixes the data inconsistency in the product with ID `00GAOMXjQNgFXhjef5NA` by:

1. Updating the Macedonian translation from "Имако вино 0.75л" (Imako wine) to "Савекс Премиум Фреш Универзален Детергент 5.5кг"
2. Updating the Albanian translation from "Verë Imako 0,75l" (Imako wine) to "Detergjent Savex Premium Fresh 5.5kg"
3. Updating all the corresponding keywords for proper search functionality

After running this script, the product matching functionality should work correctly when it finds this product.
