const  mongoose  = require("mongoose");

const  Schema  =  mongoose.Schema;
const  taskSchema  =  new Schema({
   owner: String,
   tasks:[String]
});
let  User  =  mongoose.model("Task", taskSchema);
module.exports  = taskSchema;