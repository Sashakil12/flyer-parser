const admin = require("firebase-admin");
const serviceAccount = require("./firebase-service-account.json");

// Initialize Firebase Admin SDK with service account
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Define the product update
const updatedProduct = {
  name: "Savex Premium Fresh Universal Detergent 5.5kg",
  albenianname: "Detergjent Savex Premium Fresh 5.5kg",
  albeniannameKeywords: [
    "d",
    "de",
    "det",
    "deter",
    "deterg",
    "detergj",
    "detergje",
    "detergjent",
    "detergjent s",
    "detergjent sa",
    "detergjent sav",
    "detergjent savex",
    "detergjent savex ",
    "detergjent savex p",
    "detergjent savex pr",
    "detergjent savex premium",
    "detergjent savex premium fresh",
    "detergjent savex premium fresh 5",
    "detergjent savex premium fresh 5.5",
    "detergjent savex premium fresh 5.5kg",
  ],
  macedonianname: "Савекс Премиум Фреш Универзален Детергент 5.5кг",
  macedoniannameKeywords: [
    "с",
    "са",
    "сав",
    "саве",
    "савек",
    "савекс",
    "савекс ",
    "савекс п",
    "савекс пр",
    "савекс пре",
    "савекс прем",
    "савекс преми",
    "савекс премиум",
    "савекс премиум ф",
    "савекс премиум фр",
    "савекс премиум фре",
    "савекс премиум фреш",
    "савекс премиум фреш у",
    "савекс премиум фреш уни",
    "савекс премиум фреш универзален",
    "савекс премиум фреш универзален детергент",
    "савекс премиум фреш универзален детергент 5.5кг",
  ],
  englishNameKeywords: [
    "s",
    "sa",
    "sav",
    "save",
    "savex",
    "savex ",
    "savex p",
    "savex pr",
    "savex pre",
    "savex prem",
    "savex premi",
    "savex premium",
    "savex premium f",
    "savex premium fr",
    "savex premium fre",
    "savex premium fresh",
    "savex premium fresh u",
    "savex premium fresh un",
    "savex premium fresh uni",
    "savex premium fresh universal",
    "savex premium fresh universal detergent",
    "savex premium fresh universal detergent 5",
    "savex premium fresh universal detergent 5.5",
    "savex premium fresh universal detergent 5.5kg",
  ],
  categoryId: "cleaning-products",
  created_at: 1708610521144,
  discountPercentage: 18.69,
  newPrice: "235",
  oldPrice: "289",
  productId: "00GAOMXjQNgFXhjef5NA",
  productType: "discounted",
  iconPath: "images/products/savex-1708610483836.PNG",
  iconUrl:
    "https://firebasestorage.googleapis.com/v0/b/badiyala-6c3e1.appspot.com/o/images%2Fproducts%2FScreenshot%202023-11-23%20204745-1700768899130.png?alt=media&token=41f6c332-852e-4942-a25a-1da102adafaa",
  imagePath: "",
  imageUrl: "",
  isDeleted: false,
  superMarketId: "EW6CohDOp86Vst9Gp4ub",
  superMarketImage:
    "https://firebasestorage.googleapis.com/v0/b/badiyala-6c3e1.appspot.com/o/images%2Fsupermarkets%2FRAMSTORE-SQUARE-1679422056606.jpg?alt=media&token=95f6e870-0b5f-4f07-b51c-66b294801fa9",
  superMarketName: "RAMSTORE",
  validFrom: "2024-02-22",
  validTo: "2026-11-01",
  databaseLocation: "nam5",
};
// const productId = "00GAOMXjQNgFXhjef5NA"
const productId = "024JQwVkethXqfZ72B6g";
// Log database connection attempt
console.log("Attempting to connect to Firestore database...");
console.log(`Target product ID: ${productId}`);

// First check if the product exists
db.collection("products")
  .doc(productId)
  .get()
  .then((doc) => {
    if (doc.exists) {
      console.log("Product exists, current data:", doc.data().name);

      // Update the product document
      return db
        .collection("products")
        .doc(productId)
        .set(updatedProduct, { merge: true });
    } else {
      console.error("Product does not exist!");
      process.exit(1);
    }
  })
  .then(() => {
    console.log("Product updated successfully.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error updating product:", error);
    console.error("Error details:", JSON.stringify(error, null, 2));
    process.exit(1);
  });
