if(process.env.NODE_ENV!=="production"){
	require('dotenv').config();
}

const express= require('express');
let app= express();
app.set("view engine","ejs");

const { v4: uuidv4}= require('uuid');
const server= require('http').Server(app);
const io= require('socket.io')(server);
const { ExpressPeerServer }= require('peer');
const port= process.env.PORT||5000;
const peerServer= ExpressPeerServer(server,{
	debug:true
})


const session = require('express-session')
const flash = require('connect-flash');
const passport= require('passport');
const localStrategy= require('passport-local'); 
app.use('/peerjs',peerServer);
const path = require('path')
app.use(express.static("public"));



 const sessionConfig={
	secret: 'Thisisasecret',
	resave: false,
	saveUninitialized: true,
	cookie:{
		httpOnly: true,
		expires: Date.now()+1000*60*60*24*7,
		maxAge: 1000*60*60*24*7
	}
}

const  User = require("./models/userschema");
app.use(session(sessionConfig));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
passport.use(new localStrategy(User.authenticate()));
//handling login
passport.serializeUser(User.serializeUser());
//handling logout
passport.deserializeUser(User.deserializeUser());
app.use((req,res,next)=>{
	res.locals.currUser= req.user;
	res.locals.success=  req.flash('success');
	res.locals.error= req.flash('error');
	next();
})
const  mongoose  = require("mongoose");
const  url  = process.env.DB_URL;
const  connect  =  mongoose.connect(url, { useNewUrlParser: true  });
const  Chat  = require("./models/chatschema");
const  Group = require("./models/groupschema");

app.use(express.urlencoded({extended:true}));
app.set('views',path.join(__dirname,'views'));
const users = [];

//function to add a user to a list of meeting participants (users)
function userJoin(id, username, room) {
  const user = { id, username, room };
  users.push(user);
  return user;
}

//function to remove a user from list of participants
function userLeave(id) {	
  const index = users.findIndex(user => user.id === id);
  if (index !== -1) {
    return users.splice(index, 1)[0];
  }
}
//getting all users in a particular room
function getRoomUsers(room) {
  return users.filter(user => user.room === room);
}

//curr: stores chat info of current user
let curr=[];
//grpname: stores the name of selected group
let grpname;
io.on("connection", (socket) => {
  socket.on("join-room", (roomId, userId, userName) => {
  	socket.join(roomId);
	//add the new user to users and send room users to client
	const nuser = userJoin(userId, userName, roomId);
	io.to(nuser.room).emit('roomUsers', {
		room: nuser.room,
		users: getRoomUsers(nuser.room)
	});
	socket.to(roomId).emit("user-connected", userId);
	//remove the user and send the updated list of participants to client
	socket.on("disconnect", () => {
	      const user = userLeave(userId);
	      socket.to(roomId).emit("user-disconnected", userId);
	      io.to(user.room).emit("roomUsers", {
	      	   room: user.room,
		   users: getRoomUsers(user.room)
	      });
    	});
	//recieve drawing event on whiteboard  
	socket.on("drawing", data => socket.to(roomId).emit("drawing", data));
	
	  //message is created in meeting
	socket.on("message", (message) => {
	    io.to(roomId).emit("createMessage", message, userName);
	    //save the message into database with groupid as roomId
	    //as a particular chat-group will always have same meeting Id
	    connect.then(db  =>  {
		   let  chatMessage  =  new Chat({ message: message, sender:userName, groupid: roomId});
		   chatMessage.save();
	    });
	});
	
	//When user is typing on notes, emit the recieved text to all users in the meeting room
	socket.on('taking-notes',(text)=>{
	    	socket.to(roomId).emit("copy-notes",text);
	});     
  });



   //message created outside the meeting in grup chat
   socket.on("chat message", function(msg, userName, groupid) {
   		socket.join(groupid);
		io.to(groupid).emit("received", { message: msg , sender:userName});
	 	connect.then(db  =>  {
	    		let  chatMessage  =  new Chat({ message: msg, sender:userName, groupid: groupid});
	   		chatMessage.save();
		});
	});

   //on selecting a particular group, set grpname to that group and redirect to /users.
   socket.on("select",function(groupid){
   		console.log("selecting");
   		grpname=groupid;
   		socket.join(groupid);
   		var destination = '/users';
		socket.emit('redirect', destination,groupid);
   });
	
    //creating a new group
   socket.on('create-group', async (group, created_by)=>{
   		connect.then(async (db)  =>  {
		    	console.log("connected  to the server");
		    	//suffix entered group name with a unique ID, so that groups with same entered name have separate meeting links
		    	let groupname= group+"---"+uuidv4();
		    	socket.join(groupname);
			//save group to both men=mbers of users and to groups collections. 
		    	let  grp  =  new Group({ name: groupname, created_by:created_by});
		    	grp.members.push(created_by);
			grp.save();
			let usergrp= await User.findOneAndUpdate({username:created_by},{$push:{groups:[groupname]}},{upsert: true});
			let gps= await User.findOne({username: created_by});
			console.log(gps.groups);
			socket.emit('user-group',groupname);
		});
   });
   //adding a new member to group
   socket.on('add-member', async (grp,member)=>{
   		connect.then(async (db)  =>  {
   			let usergrp= await User.findOneAndUpdate({username:member},{$push:{groups:[grp]}});
   			await Group.findOneAndUpdate({name: grp},{$push:{members:[member]}});
  			
   		});
   })
});




let name="";
//middleware to check if a user is authenticated
const isLoggedIn= async (req,res,next)=>{
	if(!req.isAuthenticated()){
		req.flash('error','You must be logged in');
		return res.redirect('/login');
	}	
	next();
}

let landing= (req,res)=>{
	res.render('landing.ejs');
};
let startMeeting=(req,res)=>{
	res.redirect(`/${req.params.groupid}`);
}
let redirectToChat=(req,res)=>{
	res.redirect('/users');
}

let getChats= async(req,res)=>{
	//load all chats of the user and save them to curr
	const grps= await User.findOne({username:req.user.username});
	//load members of the selected group;
 	const group= await Group.findOne({name: grpname});
 	let members=[];
 	if(group){
		members= group.members;
	}
	//redirect to the required group iff user is authenticated and a member of required group
	if(req.user && members.includes(req.user)){
		const username= req.user.username;
		if(grps!=null){
			let curr=[];
			for(let g of grps.groups){
				const allmsgs= await Chat.find({groupid: g});
				curr[g]= allmsgs;
			}

			res.render('home.ejs', {grps: grps.groups,username, chats:curr, grpname,members});
		}else{
			res.render('home.ejs',{grps:[],username, chats:[], grpname,members});
		}
	}
}

let loginPg=(req,res)=>{
 	res.render('login.ejs');
}
let registerPg=(req,res)=>{
 	res.render('register.ejs');
}
let handleLogin=(req,res)=>{
	if(req.session.returnTo){
		res.redirect(req.session.returnTo);
		delete req.session.returnTo;
	}else{
		req.flash('success', 'Successfully logged in');
		res.redirect('/users');
	}
}
let handleRegister=async (req,res)=>{
 	const {email, username, password}= req.body;
	const nu = new User({email, username});
	const regdUser= await User.register(nu, password);
	req.flash('success','Successfully registered')
	res.redirect('/login')
}
let videoCall= (req,res)=>{
  	let room= req.params.room;
  	if(req.user){
		const username= req.user.username;
	 	res.render('room.ejs',{roomid: room, username, groupid:room});
  	}
}
let logout = (req,res)=>{
	req.logout();
	req.flash('success', 'logged out')
	res.redirect('/login');
}
//ROUTES
app.get('/',landing);
app.get('/room/:groupid',isLoggedIn,startMeeting);
app.post('/users',isLoggedIn,redirectToChat);
app.get('/users',isLoggedIn,getChats);
app.get('/login',loginPg)
app.get('/register',registerPg)
app.post('/login',passport.authenticate('local',{failureFlash:'Invalid username or password', failureRedirect:'/login'}),handleLogin);
app.post('/register',handleRegister);
app.get('/logout',logout);
app.get('/:room',isLoggedIn,videoCall);


server.listen(port,(req,res)=>{
	console.log('HELLOOO!');
});
