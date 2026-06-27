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
        const bookmarksColl = db.collection('bookmarks')
        const transactionsColl = db.collection('transactions')
        const sessionCollection = db.collection('session');

        // verification related fucntions
        const verifyToken = async (req, res, next) => {

            const authHeader = req.headers?.authorization;
            if (!authHeader) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            const token = authHeader.split(' ')[1]

            if (!token) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            const query = { token: token }
            const session = await sessionCollection.findOne(query);

            if (!session) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            const userId = session.userId;


            const userQuery = {
                _id: userId
            }

            const user = await usersColl.findOne(userQuery);
            if (!user) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            // set data in the req object
            req.user = user;
            next();
        }

        // must be used after verifyToken middleware
        const verifyReader = async (req, res, next) => {
            if (req.user?.role !== 'reader') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }

        // must be used after verifyToken middleware
        const verifyWriter = async (req, res, next) => {
            if (req.user?.role !== 'writer') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }

        // must be used after verifyToken middleware
        const verifyAdmin = async (req, res, next) => {
            if (req.user.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }

        // --------- OPEN FETCHES ---------- //

        // get all books
        // ─── Backend: Express route update ───────────────────────────────────────────
        // Replace your existing GET /api/books with this version.
        // It accepts: ?search=&genre=&writer=&page=&limit=

        app.get('/api/books', async (req, res) => {
            const {
                search = "",
                genre = "",
                writer = "",
                page = "1",
                limit = '9',
            } = req.query;

            const pageNum = Math.max(1, parseInt(page, 10));
            const limitNum = Math.max(1, parseInt(limit, 10));
            const skip = (pageNum - 1) * limitNum;

            // Build MongoDB filter
            const filter = { parchment: { $regex: /^published$/i } };

            if (search) {
                filter.$or = [
                    { title: { $regex: search, $options: "i" } },
                    { writerName: { $regex: search, $options: "i" } },
                ];
            }

            if (genre) filter.genre = { $regex: `^${genre}$`, $options: "i" };
            if (writer) filter.writerName = { $regex: `^${writer}$`, $options: "i" };

            const [books, total] = await Promise.all([
                booksColl.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).toArray(),
                booksColl.countDocuments(filter),
            ]);

            res.json({
                books,
                total,
                totalPages: Math.ceil(total / limitNum),
                page: pageNum,
            });
        });

        app.get('/api/books-admin', async (req, res) => {
            const {
                search = "",
                genre = "",
                writer = "",
                page = "1",
                limit,
            } = req.query;

            const pageNum = Math.max(1, parseInt(page, 10));
            const limitNum = Math.max(1, parseInt(limit, 10));
            const skip = (pageNum - 1) * limitNum;

            // Build MongoDB filter
            const filter = { parchment: { $regex: /^published$/i } };

            if (search) {
                filter.$or = [
                    { title: { $regex: search, $options: "i" } },
                    { writerName: { $regex: search, $options: "i" } },
                ];
            }

            if (genre) filter.genre = { $regex: `^${genre}$`, $options: "i" };
            if (writer) filter.writerName = { $regex: `^${writer}$`, $options: "i" };

            const [books, total] = await Promise.all([
                booksColl.find().sort({ createdAt: -1 }).skip(skip).limit(limitNum).toArray(),
                booksColl.countDocuments(filter),
            ]);

            res.json({
                books,
                total,
                totalPages: Math.ceil(total / limitNum),
                page: pageNum,
            });
        });

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

        // ------------- global fetches ----------------

        // add to bookmarks (global user function)
        app.post('/api/bookmarks', async (req, res) => {
            const bookmarkData = req.body
            const result = await bookmarksColl.insertOne(bookmarkData)
            res.json(result)
        })

        // get all bookmarked books
        app.get('/api/bookmarks', async (req, res) => {
            const filter = {}
            if (req.query.userId) {
                filter.userId = req.query.userId
            }

            console.log(filter);

            const bookmarks = await bookmarksColl.find(filter).toArray()

            const bookIds = bookmarks.map(bookmark => bookmark.bookId)


            const books = await booksColl.find({
                _id: {
                    $in: bookIds.map(id => new ObjectId(id))
                }
            }).toArray()
            res.json(books)
        })

        // remove from the bookmark
        app.delete('/api/bookmarks/:id', async (req, res) => {
            const id = req.params.id
            const filter = {
                bookId: id
            }
            const result = await bookmarksColl.deleteOne(filter)
            res.json(result)
        })

        // --------------------------------------------------


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

            // console.log(query);

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

        // get writer's stats
        app.get('/api/writer-stats', verifyToken, verifyWriter, async (req, res) => {
            const query = {}
            if (req.query.writerId) {
                query.writerId = req.query.writerId
            }

            const books = await booksColl.find({
                writerId: query.writerId
            }).toArray()

            const stats = await booksColl.aggregate([
                {
                    $match: {
                        writerId: query.writerId
                    }
                },
                {
                    $group: {
                        _id: null,

                        totalBooks: {
                            $sum: 1
                        },

                        publishedBooks: {
                            $sum: {
                                $cond: [
                                    {
                                        $eq: [
                                            "$parchment",
                                            "published"
                                        ]
                                    },
                                    1,
                                    0
                                ]
                            }
                        },

                        unpublishedBooks: {
                            $sum: {
                                $cond: [
                                    {
                                        $eq: [
                                            "$parchment",
                                            "unpublished"
                                        ]
                                    },
                                    1,
                                    0
                                ]
                            }
                        },

                        totalSales: {
                            $sum: "$purchaseCount"
                        }
                    }
                }
            ]).toArray()

            res.json({
                stats: stats[0],
                books
            })
        })

        // upload a book (writer fucniton)
        app.post('/api/books', async (req, res) => {
            const data = req.body
            const newBook = {
                ...data,
                createdAt: new Date().toISOString()
            }
            const result = await booksColl.insertOne(newBook)
            res.json(result)
        })

        // update a book uploaded by writer (writer function)
        app.patch('/api/books/:id', async (req, res) => {
            const id = req.params.id
            const filter = {
                _id: new ObjectId(id)
            }
            const updatedData = req.body

            // console.log(updatedData);

            const result = await booksColl.updateOne(filter, {
                $set: updatedData
            })
            res.json(result)
        })

        // publish or unpublish a book (admin function)
        app.patch('/api/books', async (req, res) => {
            const query = {}
            if (req.body.bookId) {
                query.bookId = req.body.bookId
            }

            if (req.body.parchment) {
                query.parchment = req.body.parchment
            }

            const filter = {
                _id: new ObjectId(query.bookId)
            }

            const updatedData = {
                $set: {
                    parchment: query.parchment
                }
            }

            const result = await booksColl.updateOne(filter, updatedData)
            res.json(result)
        })

        // delete a book
        app.delete('/api/books/:id', async (req, res) => {
            const id = req.params.id

            // console.log(id);
            const query = {
                _id: new ObjectId(id)
            }

            const result = await booksColl.deleteOne(query)
            res.json(result)
        })

        // users
        // get all users 
        app.get('/api/users', async (req, res) => {
            const cursor = usersColl.find()
            const result = await cursor.toArray()
            res.json(result)
        })

        // update a user role
        app.patch('/api/users', async (req, res) => {
            const query = {}
            // console.log(req.body);
            if (req.body.userId) {
                query.userId = req.body.userId
            }

            if (req.body.newRole) {
                query.role = req.body.newRole
            }

            const filter = {
                _id: new ObjectId(query.userId)
            }

            // console.log(query);

            const updatedData = {
                $set: {
                    role: query.role
                }
            }

            const result = await usersColl.updateOne(filter, updatedData)

            res.json(result)
        })

        // delete a user
        app.delete('/api/users/:id', async (req, res) => {
            const id = req.params.id

            // console.log(id);
            const query = {
                _id: new ObjectId(id)
            }

            const result = await usersColl.deleteOne(query)
            res.json(result)
        })

        // // transactions
        app.post('/api/transactions', async (req, res) => {
            try {
                const data = req.body;

                const transactionResult =
                    await transactionsColl.insertOne(data);

                await booksColl.updateOne(
                    {
                        _id: new ObjectId(data.bookId),
                    },
                    {
                        $inc: {
                            purchaseCount: 1,
                        },
                    }
                );

                res.send({
                    success: true,
                    insertedId: transactionResult.insertedId,
                });
            } catch (error) {
                console.error(error);

                res.status(500).send({
                    success: false,
                    message: error.message,
                });
            }
        });

        // get all transaactions-books
        app.get('/api/transactions', async (req, res) => {
            const result = await transactionsColl.find().toArray()
            res.json(result)
        })

        // get purchased books
        // app.get('/api/purchased-books', async (req, res) => {

        //     const pipeline = [
        //         {
        //             $match: {
        //                 buyerId: req.query.buyerId
        //             }
        //         },
        //         {
        //             $lookup: {
        //                 from: "books",

        //                 let: {
        //                     bookId: "$bookId"
        //                 },

        //                 pipeline: [
        //                     {
        //                         $match: {
        //                             $expr: {
        //                                 $eq: [
        //                                     {
        //                                         $toString: "$_id"
        //                                     },
        //                                     "$$bookId"
        //                                 ]
        //                             }
        //                         }
        //                     }
        //                 ],

        //                 as: "book"
        //             }
        //         },
        //         {
        //             $unwind: "$book"
        //         }
        //     ]

        //     const purchasedBooks = await transactionsColl
        //         .aggregate(pipeline)
        //         .toArray()

        //     res.json(purchasedBooks)
        // })

        app.get('/api/purchased-books', async (req, res) => {

            const pipeline = [
                {
                    $match: {
                        buyerId: req.query.buyerId
                    }
                },
                {
                    $lookup: {
                        from: "books",
                        let: {
                            bookId: "$bookId"
                        },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $eq: [
                                            { $toString: "$_id" },
                                            "$$bookId"
                                        ]
                                    }
                                }
                            }
                        ],
                        as: "book"
                    }
                },
                {
                    $unwind: "$book"
                },
                {
                    $replaceRoot: {
                        newRoot: "$book"
                    }
                }
            ]

            const purchasedBooks = await transactionsColl.aggregate(pipeline).toArray()

            res.json(purchasedBooks)
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