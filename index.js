const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express')
const app = express()
const cors = require('cors')
const dotenv = require('dotenv');
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
dotenv.config()

const port = process.env.PORT
const uri = process.env.MONGO_URI

app.use(cors())
app.use(express.json())

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const db = client.db('fable')
        const booksColl = db.collection('books')
        const usersColl = db.collection('user')
        const writersColl = db.collection('writers')

        // --------- OPEN FETCHES ---------- //

        // get all books
        app.get('/api/books', async (req, res) => {
            const cursor = booksColl.find()
            const result = await cursor.toArray()
            res.json(result)
        })

        // get all writers
        app.get('/api/writers', async (req, res) => {
            const cursor = writersColl.find()
            const result = await cursor.toArray()
            res.json(result)
        })

        // get featured books
        app.get('/api/featured-books', async (req, res) => {
            const cursor = booksColl.find().sort({ rating: -1 }).limit(3)
            const result = await cursor.toArray()
            res.json(result)
        })

        // GET TOP WRITERS 
        app.get('/api/top-writers', async (req, res) => {
            const result = await writersColl.find().sort({ booksCount: -1 }).limit(4).toArray()
            res.json(result)
        })

        // ------------------------------------------------------------------


        // ------------ SECURED FETCHES ----------------
        // books
        app.get('/api/books/:id', async (req, res) => {
            const id = req.params.id
            const query = {
                _id: new ObjectId(id)
            }

            const result = await booksColl.findOne(query)
            res.json(result)
        })

        // get books by writer id
        app.get('/api/writer-books', async (req, res) => {
            const query = {}
            if (req.query.writerId) {
                query.writerId = req.query.writerId
            }

            console.log(query);

            const result = await booksColl.aggregate([
                { $match: { writerId: query.writerId } },
                {
                    $project: {
                        _id: 1,
                        genre: 1,
                        title: 1,
                        price: 1
                    }
                }
            ]).toArray()

            res.json(result)
        })

        // get all users 
        app.get('/api/users', async (req, res) => {
            const cursor = usersColl.find()
            const result = await cursor.toArray()
            res.json(result)
        })

        // update a user role
        app.patch('/api/users', async (req, res) => {
            const query = {}
            console.log(req.body);
            if (req.body.userId) {
                query.userId = req.body.userId
            }

            if (req.body.newRole) {
                query.role = req.body.newRole
            }

            const filter = {
                _id: new ObjectId(query.userId)
            }

            console.log(query);

            const updatedData = {
                $set: {
                    role: query.role
                }
            }

            const result = await usersColl.updateOne(filter, updatedData)

            res.json(result)
        })

        // Send a ping to confirm a successful connection hello
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.listen(port, () => {
    console.log('server running on port', port);
})