const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();
require("dotenv").config();

// port
const port = process.env.port || 5000;

// middlewares
app.use(
  cors({
    origin: [
      "https://tomatino-project.web.app",
      "https://tomatino-project.firebaseapp.com",
      "http://localhost:5173",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  res.send("tomatino restaurant is running");
});

app.listen(port, () => {
  console.log(`App listening on port: ${port}`);
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yiog314.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// middlewares
const logger = (req, res, next) => {
  // console.log(req.method, req.url);
  next();
};

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  // console.log("token in the middleware", token);
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_SECRET_TOKEN, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const foodCollection = client.db("tomatinoDB").collection("allFoods");
    const purchasedFoodCollection = client
      .db("tomatinoDB")
      .collection("purchasedFoods");

    // auth related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      // console.log("user for token", user);
      const token = jwt.sign(user, process.env.ACCESS_SECRET_TOKEN, {
        expiresIn: "1h",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
        })
        .send({ success: true });
    });

    app.post("/logout", async (req, res) => {
      const user = req.body;
      console.log("logging out user");
      res.clearCookie("token", { maxAge: 0 }).send({ success: true });
    });

    // all foods realted api
    app.get("/allfoods", async (req, res) => {
      let query = {};
      const page = parseInt(req?.query?.page);
      const size = parseInt(req?.query?.size);
      let searchField = req.query?.search;
      if (req.query?.search) {
        query = { name: { $regex: ".*" + searchField + ".*", $options: "i" } };
      } else if (req.query?.email) {
        query = { email: req.query?.email };
      }
      // console.log(req.query);
      const result = await foodCollection
        .find(query)
        .skip(page * size)
        .limit(size)
        .toArray();
      // console.log(result.length);
      res.send(result);
    });

    app.post("/allfoods", async (req, res) => {
      const newFood = req.body;
      // console.log(newFood);
      const result = await foodCollection.insertOne(newFood);
      res.send(result);
    });

    app.get("/food/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await foodCollection.findOne(query);
      res.send(result);
    });

    app.put("/food/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedFood = req.body;
      const food = {
        $set: {
          name: updatedFood.name,
          photo: updatedFood.photo,
          category: updatedFood.category,
          quantity: updatedFood.quantity,
          price: updatedFood.price,
          origin: updatedFood.origin,
          description: {
            ingredients: updatedFood.description.ingredients,
            procedure: updatedFood.description.procedure,
          },
          email: updatedFood.email,
          purchaseTime: updatedFood.purchaseTime,
        },
      };
      console.log(food);
      const result = await foodCollection.updateOne(filter, food, options);
      res.send(result);
    });

    app.delete("/food/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await foodCollection.deleteOne(query);
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    app.patch("/allfoods/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedFood = req.body;
      console.log(updatedFood, filter);
      const updatedDoc = {
        $set: { ...updatedFood },
      };
      const result = await foodCollection.updateOne(filter, updatedDoc);
      console.log(result);
      res.send(result);
    });

    // top foods
    app.get("/topfoods", async (req, res) => {
      try {
        aggregationPipeline = [
          { $addFields: { convertedPrice: { $toInt: "$purchase" } } },
          { $sort: { convertedPrice: -1 } },
          { $project: { convertedPrice: 0 } },
        ];
        const result = await purchasedFoodCollection
          .aggregate(aggregationPipeline)
          .toArray();
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    // purchase food related api
    app.get("/purchasedFood", logger, verifyToken, async (req, res) => {
      // console.log(query);
      // console.log("token owner", req.user);
      if (req.user?.email !== req.query?.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      let query = {};
      if (req.query?.email) {
        query = { email: req.query.email };
      }
      const result = await purchasedFoodCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/purchasedFood", async (req, res) => {
      const purchasedFood = req.body;
      // console.log(purchasedFood);
      const result = await purchasedFoodCollection.insertOne(purchasedFood);
      res.send(result);
    });

    app.delete("/purchasedFood/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await purchasedFoodCollection.deleteOne(query);
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
