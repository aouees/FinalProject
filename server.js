let path = require('path')
var express = require('express')
var app = express()
app.use(express.static(path.join(__dirname, 'public')))

var bodyparsser = require('body-parser')
var parser = bodyparsser.urlencoded({ extended: true })

app.set('view engine', 'ejs')
app.set('views', 'views')

const sessions = require('express-session');
const store = new sessions.MemoryStore();
const oneDay = 1000 * 60 * 60 * 24;
app.use(sessions({
  secret: "thisismysecrctekeyfhrgfgrfrty84fwir767",
  saveUninitialized: true,
  cookie: { maxAge: oneDay },
  resave: true,
  store
}));

/////////////////////////////////////////////////////////////////
const multer = require('multer')
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "excelFiles"))
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
})

const excelFilter = (req, file, cb) => {
  if (file.mimetype.includes("excel") || file.mimetype.includes("spreadsheetml")) {
    cb(null, true);
  }
  else {
    cb("Please upload only excel file.", false);
  }
};


let uploadFile = multer({ storage: storage, fileFilter: excelFilter });
//////////////////////////////////////////////////////////////////////////////////////////////

var db = require('./model/db')
//================================================================
const readXlsxFile = require('xlsx');
const { table } = require('console')

//================================================================

app.get('/', (req, res) => {
  var s = req.session
  if (s.username) {
    res.redirect("/homepage")
  }
  else {
    res.redirect('/login')
  }
})

app.get('/login', (req, res) => {
  res.render("login")
})


app.post("/login", parser, function (req, res) {
  var user = req.body.username
  var pass = req.body.password
  var q = 'select * from account where username =? and password=?'
  db.query(q, [user, pass], (err, result,) => {
    if (err) {
      res.send(err.message)
    }
    else {
      if (result.length == 0) {
        res.redirect('/login')
      }
      else {
        req.session.username = user
        req.session.name = result[0]['name']
        res.redirect('/homepage')
      }
    }
  })
})

app.get('/homepage', function (req, res) {
  if (req.session.username) {
    user = req.session.username

    q = 'select * from filepath where username=(?)';
    db.query(q, [user], function (err, resultes) {
      if (err) {
        console.log('error in setting methode in select our file');
        res.send(err.message);
      }
      else {
        let restlist = []
        let preReqlist = [];
        resultes.forEach(row => {
          if (row.type === 'P') {
            preReqlist.push(row);
          }
          else {
            restlist.push(row);
          }
        });
        res.render('homepage',
          {
            restFiles: restlist,
            preReqFiles: preReqlist,
            name: req.session.name
          });
      }
    })

  }
  else {
    res.redirect('/login')
  }
})

//  طلب لحذف الملفات بالجداول       
app.get('/deletefiles', (req, res) => {
  q = 'DELETE FROM filepath WHERE (id = ?);'
  id = req.query.id
  db.query(q, [id], (err, resultes) => {
    if (err) {
      res.send(err.message)
    }
    else {
      res.redirect('/homepage')
    }

  })
})
// طلب لاضافة الملف الخاص بالمواد المتبقية للطلاب 
app.post('/ChoosefileRest', uploadFile.single('rest_stu'), (req, res) => {
  q = 'INSERT INTO filepath(username,type,path)VALUES(?,?,?);'
  db.query(q, [req.session.username, "R", req.file.filename], (err, result) => {
    if (err) {
      console.log(err)
      res.send(err.message)
    }
    else {
      res.redirect('/homepage')
    }
  })
})
// طلب خاص لاضافة الملف الخاص بالمتطلبات السابقة للمواد 
app.post('/ChoosefilePre', uploadFile.single('pre_req'), (req, res) => {
  q = 'INSERT INTO filepath(username,type,path)VALUES(?,?,?);'
  db.query(q, [req.session.username, "P", req.file.filename], (err, result) => {
    if (err) {
      console.log(err)
      res.send(err.message)
    }
    else {
      res.redirect('/homepage')

    }
  })

})
// طلب لاختيار الملفين وهما المملف الخاص بالمتطلبات السابقة 
// والملف الخاص بالمواد المتبقية 
// وذلك حتى يختارهم مدير القسم قبل ان يتم عرض النتيجة 

// my algorithim
app.post('/send', parser, (req, res) => {
  var PreReqFile = req.body.PreReqFile
  var RestStuFile = req.body.RestStuFile
  var cumulativehours=req.body.cumulativehours

  // read pre requisst file
  let workbook = readXlsxFile.readFile(path.join(__dirname, "excelFiles", PreReqFile), { encoding: 'utf8' });
  // get name the first sheet
  let sheetName = workbook.SheetNames[0];
  // get the first sheet
  let worksheet = workbook.Sheets[sheetName];
  // read first sheet as json 
  let data = readXlsxFile.utils.sheet_to_json(worksheet, { header: 1 });
  // order the column in preRequset file :
  /// index 0 : رمز المادة 
  // index  1: اسم المادة
  // index 2 : اسم المادة السابقة 
  // index 3 : رمز االمادة السابقة 

  // builde map to store corse_code as key and all pre_request for this course in the set
  // ITEMATH : ( ITEDFGH,ITEFGH,ITESSS)

  var preReq = {}
  data.forEach((row) => {
    if (preReq[row[0]]) {
      preReq[row[0]].add(row[3])
    }
    else {
      preReq[row[0]] = new Set([row[3]])
    }
  })


  workbook = readXlsxFile.readFile(path.join(__dirname, "excelFiles", RestStuFile), { encoding: 'utf8' });
  sheetName = workbook.SheetNames[0];
  worksheet = workbook.Sheets[sheetName];
  data = readXlsxFile.utils.sheet_to_json(worksheet, { header: 1 });

  // index 0 : course name
  // index 1 : student id
  // index 2 : course code 
  // index 3 : student name
  // index 4 : year level for student
  // index 5 : 
  // index 6 : number hours registered this semestrial
  // index 7 : cumulative hours 
  // index 8 : gpa for student
  // index 9 : department  

  // student_id :( ITEDFGH,ITEFGH,ITESSS) المقررات الباقية لهاد لطالب
  let student = {}
  data.forEach((row) => {
    if (student[row[1]]) {
      student[row[1]].add(row[2])
    } else {
      student[row[1]] = new Set([row[2]])
    }
  })

  course={}
  data.forEach((row) => {
    // first we will test if student take all preRequest course ( intersection )
    intersection = new Set()
    if (preReq[row[2]]) // row[2]=coursecode preReq[row[2]]= preReq courses for coursecode
    {
      intersection = new Set(Array.from(preReq[row[2]]).filter(i => student[row[1]].has(i)))
    }
    if (intersection.size == 0)  // if true the student can register this course 
    {
      if(!course[row[2]]) // if course not found in  map 
      {
        course[row[2]]= {'g':new Set(),'n':new Set(),'courseName':row[0]}
      }

      if ( parseInt(row[7])>= parseInt(cumulativehours)) { // if he is gradu student
        course[row[2]]['g'].add(row[3]+'-'+row[1]) 
      }
      else{
         course[row[2]]['n'].add(row[3]+'-'+row[1]) 
       }
      }
  })
  sortArray=Array.from( Object.entries(course))
  sortArray.sort((a,b)=>{
  if(a[1]['g'].size<b[1]['g'].size){
    return 1;
  }
  else if(a[1]['g'].size==b[1]['g'].size){
    if(a[1]['n'].size<b[1]['n'].size){
      return 1;
    }
    else{
      return -1;
    }
  }
  else{
    return -1;
  }
})
sortMap=Object.fromEntries(sortArray)

  res.render('table',
    {
     course:sortMap
    })

})



app.get('/table', (req, res) => {
  if (!req.session.username) {
    res.redirect('/login')
  }
  else {
    let q = 'select c.id,c.name from curriculum c join department_manager d on c.dep_manager_id= d.id join account a on d.account_id=a.id where a.id=?'
    db.query(q, [req.session.a_id], (err, result) => {
      if (!err) {
        db.query('select * from level;', (err, result1) => {
          if (!err) {
            res.render("table", { c: result, l: result1 })
          }
          else {
            res.send(err)
          }
        })
      } else {
        res.send(err)
      }
    })
  }
})
app.get('/students', (req, res) => {
  if (!req.session.username) {
    res.redirect('/login')
  }
  else {
    res.render('students')
  }
})

app.get("/logout",(req,res)=>{
  req.session.destroy()
  res.redirect("/login")
})

app.listen(5000, () => {
  console.log('listening on http://localhost:5000')
})
