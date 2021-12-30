var dbconnection = require('../lib/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { promisify } = require('util');
const { Console } = require('console');
const mailgun = require("mailgun-js");
const DOMAIN = process.env.DOMAIN;
const mg = mailgun({apiKey: process.env.MAILGUN_APIKEY, domain: DOMAIN});


async function login(req, res){
    try {
        const { emailAddress, password} = req.body;
        
        if(!emailAddress || !password){
            return res.status(400).render('login', {
                message: 'Please provide an email and password'
            })
        }

        dbconnection.query('SELECT * FROM user WHERE emailAddress = ?', [emailAddress], async (err, results) => {
            
            if(results.length ===  0 || !(await bcrypt.compare(password, results[0].password))){
                res.status(401).render('login', {
                    message: 'Email or Password is incorrect'
                })
            }else {
                const id = results[0].user_id;
                
                const token = jwt.sign({ id: id}, process.env.JWT_SECRET);


                const cookieOptions = { httpOnly: true }

                res.cookie('jwt', token, cookieOptions);
                res.status(200).redirect("/");
            }
        });


    }catch (error){
        console.log(error)
    }
}


async function register(req, res){
    const { first_name,
        last_name,
        emailAddress,
        phoneNumber,
        country,
        password,
        confirm_pass
    } = req.body

    if (password !== confirm_pass){
        return res.render('signup', {message: 'Passwords do not match'})
    }else{
        dbconnection.query('SELECT emailAddress FROM user WHERE emailAddress = ?', [emailAddress], async (err, results) => {
            if (err) {
                console.log(err)
            }
            if (results.length > 0){
                return res.render('signup', {message: 'That email is already in use'})
            }
            
            let hashedPassword = await bcrypt.hash(password, 8);
            const query = `INSERT INTO user(first_name, last_name, emailAddress, country, phone_number, password  ) VALUES( '${first_name}',
                            '${last_name}',
                            '${emailAddress}',
                            '${country}',
                            '${phoneNumber}',
                            '${hashedPassword}'
            )`;
            dbconnection.query(query,  (err, results) => {
    
                if (err){
                    console.log(err)
                } else{
                    const token = jwt.sign({ emailAddress: emailAddress}, process.env.JWT_ACC_ACTIVATE, {expiresIn: '10m'});

                    const data = {
                        from: 'noreply@hello.com',
                        to: 'email',
                        subject: 'Account Activation Link',
                        html: `
                            <h2>Click here to activate your account</h2>
                            <p>${process.env.CLIENT_URL}/authentication/activate/${token}</p>
                        `
                    };
                    mg.messages().send(data, function (error, body) {
                        if (error){
                            console.log(error)
                        }
                        // Change email status to Verified.
                    });
                    console.log(results)
                    res.status(200).redirect('/login')
                }
            })
    
        });
    }
    
}


function activateAccount(req, res){
    console.log('reqqq', req.params.token)
    const token = req.params.token;
    console.log('token1',token)
    if (token){
        jwt.verify(token, process.env.JWT_ACC_ACTIVATE, function(err, decodedToken){
            if(err){
                return res.status(400).json({error: 'Incorrect or Expired link.'})
            }
            const {emailAddress} = decodedToken
            console.log(emailAddress)
            const query = `UPDATE user SET emailStatus = 'verified' WHERE emailAddress = '${emailAddress}'`

            dbconnection.query(query,  (err, results) => {

            if (err){
                console.log(err)
            } else{
                console.log(results)
                res.status(200).redirect('/login')
            }
            })
        
        })
    }else{
        console.log('Errrror')
    }
}


async function donation(req, res){
    const { 
        emailAddress,
        amountMoney
    } = req.body


    dbconnection.query('SELECT * FROM user WHERE emailAddress = ?', [emailAddress], async (err, results) => {
        let user_id = results[0].user_id;
        const query = `INSERT INTO donation(amount, user_id, group_id) VALUES( ${amountMoney},'${user_id}','${4}')`;

        dbconnection.query(query,  (err, results) => {

        if (err){
            console.log(err)
        } else{
            console.log(results)
            res.status(200).redirect('/')
        }
        })
    })
    
}


async function isLoggedIn(req, res, next){
    console.log(req.cookies)
    if(req.cookies.jwt){
        try{
            const decoded = await promisify(jwt.verify)(req.cookies.jwt, process.env.JWT_SECRET)
            dbconnection.query('SELECT * FROM user WHERE user_id = ?', [decoded.id], (err, result)=>{

                if(!result){
                    return next();
                }

                req.user = result[0];
                return next();
            });
        }catch(err){
            console.log(err)
            return next();
        }
    }else{
        next();
    }
}


async function logout(req, res){
    res.cookie('jwt', 'logout', {
        expires: new Date(Date.now()), 
        httpOnly: true
    });
    res.status(200).redirect('/')

  
    
}


module.exports = {
    login,
    register,
    isLoggedIn,
    logout,
    donation,
    activateAccount
}