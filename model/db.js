let sql=require('mysql')

let db=sql.createConnection({
    host:'localhost',
    user:'root',
    password:'1234',
    port:3306,
    database:'coursemanagement'
})
db.connect((err)=>{
    if(!err){
        console.log('Connected to database')
    }
    else{
        console.log(err)
    }
})
module.exports=db







