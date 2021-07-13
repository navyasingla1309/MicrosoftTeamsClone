let socket = io();
let messages = document.getElementById("messages");
//form to make messages
//emit socket event on submitting form
$("#form").submit(function(e) {
  let li = document.createElement("li");
  e.preventDefault(); // prevents page reloading
  socket.emit("chat message", $("#message").val(),username,groupid);
  //scroll to bottom, everytime a new message is added to list
  scrollToBottom();
  $("#message").val("");
});

//message recieved by other users in the group
socket.on("received", data => {
  console.log("received");
  messages.innerHTML =
  messages.innerHTML +
    `<li class="msg ${
          username == data.sender ? 'me' : 'other'
        }" style="list-style-type:none; ">
        <p><b>${
          username == data.sender ? "me" : data.sender
        }</b></p>
        <p >${data.message}</p>
    </li>`;

  scrollToBottom();
});
 
//submitting form for creating group
$('.create').submit(function(e){
	e.preventDefault();
	socket.emit("create-group",$('#grpname').val(), username);
});
//starting video call with the group
$(".call").on("click",(e)=>{
	let grp= e.currentTarget.classList[4];
	window.location.href =`/room/${grp}`;

})

//selecting a group from grouplist
$("h4").on("click",(e)=>{
	$(".chat-title").innerHTML= `${e.currentTarget.innerHTML}`;
	socket.emit("select",e.currentTarget.classList[0]);
});

socket.on('redirect', function(destination,grp) {
    window.location.href = destination;
});


//adding new group to grouplist after creating group
socket.on('user-group',function(name){
	let newgroup= document.createElement("h4");
	let i= name.indexOf("---");
	let nn= name.substring(0,i)
	newgroup.innerHTML=nn;
	document.querySelector(".groups").append(newgroup);
	window.location.href ='/users';
})
const scrollToBottom = () => {
  let d = $('#messages');
  d.scrollTop(d.prop("scrollHeight"));
}
scrollToBottom();

//adding member to group
$(".add").on('click',(e)=>{
	let grp= e.currentTarget.classList[4];
	let nm= prompt("New member");
	if(nm!==""){
		socket.emit('add-member',grp,nm);
	}
});
$(".leave").on('click',(e)=>{
  	let grp= e.currentTarget.classList[3];
  	socket.emit("leave-group",grp,username);

});
