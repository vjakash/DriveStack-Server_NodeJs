const AWS = require('aws-sdk');
const bcrypt = require('bcrypt');
const atob = require('atob');
const Razorpay = require('razorpay');
const instance = new Razorpay({
    // key_id: process.env.RAZORPAY_KEY,
    key_id: "rzp_test_VOOCC5sS9NmTSF",
    key_secret: "V3iI59d2EyyBpKAxThdGHLTT"
        // key_secret: process.env.RAZORPAY_SECRET
})
const dotenv = require('dotenv');
dotenv.config();

const mongodb = require('mongodb');
const mongoClient = mongodb.mongoClient;
const dbURL = process.env.dbURL;

const express = require('express');
const app = express();

let jwt = require('jsonwebtoken');
let reference = 0;
const cors = require('cors');
app.use(cors());
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "*");
    if (req.method == 'OPTIONS') {
        res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,PATCH");
        return res.status(200).json({});
    }
    next();
})

const bodyParser = require('body-parser');
app.use(bodyParser.json());

const port = process.env.PORT || 3000;

const nodemailer = require('nodemailer');

let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL,
        pass: process.env.PASSWORD
    }
});

let mailOptions = {
    from: process.env.EMAIL,
    to: '',
    subject: 'Sending Email using Node.js',
    html: `<h1>Hi from node</h1><p> Messsage</p>`
};
let s3Client = new AWS.S3({
    accessKeyId: process.env.KEY,
    secretAccessKey: process.env.SECRET,
    // region: 'Mumbai',
    apiVersion: '2006-03-01'
        // bucketName = 'node-sdk-sample-'
})
async function authenticate(req, res, next) {
    if (req.headers.authorization == undefined) {
        res.status(401).json({
            message: "No token present"
        })
    } else {
        jwt.verify(req.headers.authorization, 'pkngrdxawdvhilpkngrdxawdvhil', (err, decoded) => {
            if (err) {
                res.status(401).json({
                    message: "Session Expired,Please Login again"
                })
                return;
            } else if (decoded.isVerified == false) {
                res.status(401).json({
                        isVerified: false,
                        message: "Verify the account to enjoy the service"
                    })
                    // console.log(decoded);
            }
            next();
        })
    }
}



app.listen(port, () => {
    console.log(`listening on port ${port}`);
})
app.post('/register', async(req, res) => {
    if (req.body.email == undefined || req.body.password == undefined) {
        res.status(400).json({
            message: "Email or password missing"
        })
    } else {
        req.body.password = atob(req.body.password);
        let client = await mongodb.connect(dbURL).catch((err) => { throw err; });
        let db = client.db("drive");
        let data = await db.collection("users").findOne({ email: req.body.email }).catch((err) => { throw err; });
        if (data) {
            client.close();
            res.status(400).json({
                message: "E-mail already registered"
            })
        } else {
            let saltRounds = req.body.email.length;
            if (saltRounds > 12) {
                saltRounds = 12;
            }
            let salt = await bcrypt.genSalt(saltRounds).catch((err) => { throw err; });
            let hash = await bcrypt.hash(req.body.password, salt).catch((err) => { throw err; });

            req.body.password = hash;
            req.body.isVerified = false;
            let data1 = await db.collection("users").insertOne(req.body).catch((err) => { throw err; });
            let buf = await require('crypto').randomBytes(32);
            let token = buf.toString('hex');
            // console.log(token);
            let expiryInHour = 120;
            let timestamp = new Date();
            let expiry = expiryInHour * 60 * 60 * 1000;
            let data2 = await db.collection("users").update({ email: req.body.email }, { $set: { verificationToken: token, verificationExpiry: expiry, verificationTimestamp: timestamp } });
            mailOptions.to = req.body.email;
            mailOptions.subject = 'Cloud Stack-Account verification '
            mailOptions.html = `<html><body><h1>Account Verification Link</h1>
                                 <h3>Click the link below to verify the account</h3>
                                <a href='${process.env.urldev}/#/verifyaccount/${token}/${req.body.email}'>${process.env.urldev}/#/verifyaccount/${token}/${req.body.email}</a><br>
                                <p>The link expires in <strong>${expiryInHour/24} Days</strong></p></body></html>`

            transporter.sendMail(mailOptions, function(error, info) {
                if (error) {
                    console.log(error);
                    res.status(500).json({
                        message: "An error occured,Please try again later"
                    })
                } else {
                    console.log('Email sent: ' + info.response);
                    res.status(200).json({
                        message: `Registration Successfull,Verification mail sent to ${req.body.email}`,
                        email: req.body.email,
                        token,
                        timestamp,
                        expiry
                    })
                    client.close();
                }
            });
        }
    }
})

app.post("/login", (req, res) => {
    if (req.body.email == undefined || req.body.password == undefined) {
        res.status(400).json({
            message: "E-mail or password missing"
        })
    } else {
        req.body.password = atob(req.body.password);
        // console.log(req.body.password)
        mongodb.connect(dbURL, (err, client) => {
            if (err) throw err;
            let db = client.db("drive");
            db.collection("users").findOne({ email: req.body.email }, (err, data) => {
                if (err) throw err;
                if (data) {
                    bcrypt.compare(req.body.password, data.password, function(err, result) {
                        if (err) throw err;
                        // result == true
                        if (result) {
                            jwt.sign({ id: data['_id'], }, 'pkngrdxawdvhilpkngrdxawdvhil', { expiresIn: '10h' }, function(err, token) {
                                if (err) throw err;
                                // console.log(token);
                                client.close();
                                res.status(200).json({
                                    message: "login successfull",
                                    token,
                                    email: data.email
                                        // isVerified: data.isVerified,
                                        // urls: data.urls
                                })
                            });
                        } else {
                            client.close();
                            res.status(401).json({
                                message: "password incorrect"
                            })
                        }
                    });
                } else {
                    client.close();
                    res.status(400).json({
                        "message": "user not found"
                    })
                }
            })
        })
    }
})
app.post('/findbyemail', async(req, res) => {
    if (req.body.email == undefined) {
        res.status(400).json({
            message: "E-mail missing"
        })
    } else {
        let client = await mongodb.connect(dbURL).catch((err) => { throw err; })
        let db = client.db("drive");
        let data = await db.collection("users").findOne({ email: req.body.email }).catch((err) => { throw err; })
        client.close();
        if (data) {
            res.status(200).json(data);
        } else {
            res.status(400).json({
                message: `No user found with Email Id- ${req.body.email}`
            })
        }

    }
})
app.post('/forgot', (req, res) => {
    require('crypto').randomBytes(32, function(ex, buf) {
        var token = buf.toString('hex');
        // console.log(token);
        mongodb.connect(dbURL, (err, client) => {
            if (err) throw err;
            let expiryInHour = 2;
            let timestamp = new Date();
            let expiry = expiryInHour * 60 * 60 * 1000;
            let db = client.db("drive");
            db.collection("users").update({ email: req.body.email }, { $set: { reset_token: token, timestamp: timestamp, expiry: expiry } }, (err, data) => {
                if (err) throw err;
                mailOptions.to = req.body.email;
                mailOptions.subject = 'Cloud Stack-Password reset '
                mailOptions.html = `<html><body><h1>Reset Password link</h1>
                                    <h3>Click the link below to redirect to password rest page</h3>
                                    <a href='${process.env.urldev}/#/resetpassword/${token}/${req.body.email}'>${process.env.urldev}/#/resetpassword/${token}/${req.body.email}</a><br>
                                    <p>The link expires in <strong>${expiryInHour} hrs</strong></p></body></html>`
                    // <a href='https://urlshortener.netlify.app/#/resetpassword/${token}/${req.body.email}'>https://urlshortener.netlify.app/#/resetpassword/${token}/${req.body.email}</a>
                transporter.sendMail(mailOptions, function(error, info) {
                    if (error) {
                        console.log(error);
                        res.status(500).json({
                            message: "An error occured,Please try again later"
                        })
                    } else {
                        console.log('Email sent: ' + info.response);

                        res.status(200).json({
                            message: `Verification mail sent to ${req.body.email}`,
                            email: req.body.email,
                            token,
                            timestamp,
                            expiry
                        })
                    }
                });
            })
        })
    });
})

app.post('/resetpassword', (req, res) => {
    mongodb.connect(dbURL, (err, client) => {
        if (err) throw err;
        let db = client.db("drive");
        db.collection("users").findOne({ email: req.body.email, reset_token: req.body.token }, (err, data) => {
            if (err) throw err;
            if (data) {
                req.body.password = atob(req.body.password);
                let saltRounds = req.body.email.length;
                if (saltRounds > 12) {
                    saltRounds = 12;
                }
                bcrypt.genSalt(saltRounds, function(err, salt) {
                    if (err) throw err;
                    bcrypt.hash(req.body.password, salt, function(err, hash) {
                        if (err) throw err;
                        // Store hash in your password DB.
                        req.body.password = hash;
                        db.collection("users").update({ email: req.body.email, reset_token: req.body.token }, { $set: { password: hash, reset_token: '', timestamp: '', expiry: '' } }, (err, data) => {
                            if (err) throw err;
                            // console.log(data);
                            client.close();
                            res.status(200).json({
                                message: "Password Changed successfully"
                            })
                        })
                    });
                });

            } else {
                res.status(400).json({
                    message: "The email id or token is not valid"
                })
            }
        })
    })
})
app.get('/verify/:token/:email', (req, res) => {
    let token = req.params.token;
    let email = req.params.email;
    console.log(token, email);
    mongodb.connect(dbURL, (err, client) => {
        if (err) throw err;
        let db = client.db("drive");
        db.collection("users").findOne({ email: email, reset_token: token }, (err, data) => {
            if (err) throw err;
            client.close();
            if (data) {
                res.status(200).json(data);
            } else {
                res.status(400).json({
                    message: "Reset link is broke...try reset the password again"
                })
            }
        })
    })
})
app.get('/accountverify/:token/:email', async(req, res) => {
    let token = req.params.token;
    let email = req.params.email;
    // console.log(token, email);
    let client = await mongodb.connect(dbURL).catch((err) => { throw err; });
    let db = client.db("drive");
    let data = await db.collection("users").findOne({ email: email, verificationToken: token }).catch((err) => { throw err; });
    if (data) {
        let timeStamp = new Date(data['verificationTimestamp']);
        let currentTimeStamp = new Date();
        let diff = Math.abs(timeStamp.valueOf() - currentTimeStamp.valueOf());
        console.log(diff)
        if (parseInt(data['verificationExpiry']) < diff) {
            res.status(200).json({
                message: "The verification link has expired register again"
            })
        } else {
            let bucketName = process.env.bucket + email.split("@")[0];
            // let bucketName = "xyzabcdefgh";
            var params = {
                Bucket: bucketName,
                ACL: "private",
                CreateBucketConfiguration: {
                    LocationConstraint: "ap-south-1"
                }
            };
            s3Client.createBucket(params, async function(err, data) {
                if (err) console.log(err, err.stack); // an error occurred
                else {
                    console.log(data); // successful response      
                    let data1 = await db.collection("users").updateOne({ email: email, verificationToken: token }, { $set: { isVerified: true, verificationToken: '', verificationExpiry: '', verificationTimestamp: '', bucketName: bucketName, tier: 'free', totalsize: '0.5' } }).catch((err) => { throw err; });
                    res.status(200).json({
                        message: "The verification of the account is successfull"
                    })

                    let thisConfig = {
                        AllowedHeaders: ["*"],
                        AllowedMethods: ["POST", "GET", "PUT", "DELETE", "HEAD"],
                        AllowedOrigins: ["*"],
                        ExposeHeaders: ["ETag"]
                    };
                    let corsRules = new Array(thisConfig);
                    var corsParams = { Bucket: bucketName, CORSConfiguration: { CORSRules: corsRules } };
                    s3Client.putBucketCors(corsParams, async function(err, data) {
                        if (err) {
                            // display error message
                            console.log("Error", err);
                        } else {
                            // update the displayed CORS config for the selected bucket
                            console.log("Success", data);
                            //updating the bucket policy
                            // let param = {
                            //     Bucket: bucketName,
                            //     Policy: "{\"Version\": \"2008-10-17\", \"Statement\": [{ \"Sid\": \"AllowPublicRead\",\"Effect\": \"Allow\",\"Principal\": {\"AWS\": \"*\"}, \"Action\": [ \"s3:GetObject\"], \"Resource\": [\"arn:aws:s3:::" + bucketName + "/*\" ] } ]}"

                            // };
                            // s3Client.putBucketPolicy(param, function(err, data) {
                            //     if (err) console.log(err, err.stack); // an error occurred
                            //     else console.log(data); // successful response
                            // });
                        }
                    });
                }
            });
        }
    } else {
        res.status(200).json({
            message: "The account is verified already"
        })
    }
})
app.post('/getuserdata', [authenticate], async(req, res) => {
    if (req.body.email != '') {
        let email = req.body.email;
        let client = await mongodb.connect(dbURL).catch((err) => { throw err; });
        let db = client.db("drive");
        let data = await db.collection("users").findOne({ email: email }).catch((err) => { throw err; });
        // console.log(email, data);
        client.close();
        res.status(200).json({
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
            isVerified: data.isVerified,
            bucketName: data.bucketName,
            totalsize: data.totalsize,
            tier: data.tier
        })
    } else {
        res.status(400).json({
            messagge: "The email address is missing"
        })
    }

})
app.post('/listobjects', [authenticate], async(req, res) => {
    if (req.body.email != '') {
        let email = req.body.email;
        let client = await mongodb.connect(dbURL).catch((err) => { throw err; });
        let db = client.db("drive");
        let data = await db.collection("users").findOne({ email: email }).catch((err) => { throw err; });
        // console.log(email, data);
        client.close();
        var params = {
            Bucket: data.bucketName
                // MaxKeys: 2
        };
        s3Client.listObjects(params, function(err, data) {
            if (err) console.log(err, err.stack); // an error occurred
            else console.log(data);
            res.status(200).json(data);
        });
    } else {
        res.status(400).json({
            messagge: "The email address is missing"
        })
    }
})
app.get("/getkeyandsec", [authenticate], (req, res) => {
    res.status(200).json({
        key: process.env.KEY,
        secret: process.env.SECRET
    })
})
app.post('/delete', [authenticate], (req, res) => {
    let bucketName = req.body.bucketName;
    let key = req.body.key;
    var params = {
        Bucket: bucketName,
        Key: key
            /* 
               where value for 'Key' equals 'pathName1/pathName2/.../pathNameN/fileName.ext'
               - full path name to your file without '/' at the beginning
            */
    };

    s3Client.deleteObject(params, function(err, data) {
        if (err) console.log(err, err.stack); // an error occurred
        else console.log(data); // successful response
    });
    res.status(200).json({
        message: `Deleted ${key}`
    })
})
app.post('/upgrade', [authenticate], async(req, res) => {
    let email = req.body.email;
    let client = await mongodb.connect(dbURL).catch((err) => { throw err; })
    let db = client.db("drive");
    let data = await db.collection("users").updateOne({ email: req.body.email }, { $set: { totalsize: "2", tier: "plus" } }).catch((err) => { throw err; })
    client.close();
    if (data) {
        res.status(200).json({
            meassage: "Upgraded the storage"
        });
    } else {
        res.status(400).json({
            message: `No user found with Email Id- ${req.body.email}`
        })
    }
})
app.post('/createOrder', [authenticate], async(req, res) => {
    let options = {
        amount: req.body.amount, // amount in the smallest currency unit
        currency: "INR",
        receipt: "order_rcptid_11",
        payment_capture: '1'
    };
    instance.orders.create(options, async function(err, order) {
        console.log(order);
        let client = await mongodb.connect(dbURL).catch((err) => { throw err; })
        let db = client.db("drive");
        let data = await db.collection("users").updateOne({ email: req.body.email }, { $set: { order: order } }).catch((err) => { throw err; })
        client.close();
        if (data) {
            res.status(200).json(order);
        } else {
            res.status(400).json({
                message: `No user found with Email Id- ${req.body.email}`
            })
        }
        res.json(order);
    });
})