const express = require("express");
const morgan = require("morgan");
const flash = require("express-flash");
const session = require("express-session");
const { body, validationResult } = require("express-validator");
const TodoList = require("./lib/todolist");
const Todo = require("./lib/todo");
const Contact = require("./lib/contact");
const { sortTodoLists, sortTodos } = require("./lib/sort");
const store = require("connect-loki");
//const favicon = require("serve-favicon");


const app = express();
const host = "localhost";
const port = 3002;
const LokiStore = store(session);

//const contactData = [
//  {
//    firstName: "Mike",
//    lastName: "Jones",
//    phoneNumber: "281-330-8004",
//  },
//  {
//    firstName: "Jenny",
//    lastName: "Keys",
//    phoneNumber: "768-867-5309",
//  },
//  {
//    firstName: "Max",
//    lastName: "Entiger",
//    phoneNumber: "214-748-3647",
//  },
//  {
//    firstName: "Alicia",
//    lastName: "Keys",
//    phoneNumber: "515-489-4608",
//  },
//];
const sortContacts = contacts => {
  return contacts.slice().sort((contactA, contactB) => {
    if (contactA.lastName < contactB.lastName) {
      return -1;
    } else if (contactA.lastName > contactB.lastName) {
      return 1;
    } else if (contactA.firstName < contactB.firstName) {
      return -1;
    } else if (contactA.firstName > contactB.firstName) {
      return 1;
    } else {
      return 0;
    }
  });
};
const HEALTH_SEGMENTS = [
  {
    file: "breathing.jpg",
    alt: "breathing",
    caption: "Breathing"
  },
  {
    file: "sleeping.png",
    alt: "sleeping",
    caption: "Sleeping"
  },
  {
    file: "eating.jpg",
    alt: "eating",
    caption: "Eating"
  },
  {
    file: "walking.jpg",
    alt: "walking",
    caption: "Walking"
  },
  {
    file: "bathing.png",
    alt: "bathing",
    caption: "Bathing"
  }
]
const clone = object => {
  return JSON.parse(JSON.stringify(object));
};

app.locals.currentPathClass = (path, currentPath) => {
  return path === currentPath ? "current" : "";
};

app.set("views", "./views");
app.set("view engine", "pug");

app.use(morgan("common"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: false }));
//app.use(favicon(path.join(dirname, "build", "favicon.ico")));
app.use(session({
  cookie: {
    httpOnly: true,
    maxAge: 31 * 24 * 60 * 60 * 1000, // 31 days in millseconds
    path: "/",
    secure: false,
  },
  name: "personal-assistant",
  resave: false,
  saveUninitialized: true,
  secret: "this is not very secure",
  store: new LokiStore({}),
}));

app.use(flash());

//session data persistence set-up
app.use((req, res, next) => {
  let todoLists = [];
  if ("todoLists" in req.session) {
    req.session.todoLists.forEach(todoList => {
      todoLists.push(TodoList.makeTodoList(todoList));
    });
  }
  req.session.todoLists = todoLists;
  next();
});

app.use((req, res, next) => {
  let contacts = []
  if ("contactData" in req.session) {
    req.session.contactData.forEach(contact => {
      contacts.push(Contact.makeContact(contact));
    });
  }
  req.session.contactData = contacts;
  next();
});

// Extract session info
app.use((req, res, next) => {
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

// Find specific todo list
const loadTodoList = (todoListId, todoLists) => {
  return todoLists.find(todoList => todoList.id === todoListId);
};

// Find specific todo
const loadTodo = (todoListId, todoId, todoLists) => {
  let todoList = loadTodoList(todoListId, todoLists);
  if (!todoList) return undefined;

  return todoList.todos.find(todo => todo.id === todoId);
};


app.get("/", (req, res) => {
  res.redirect("/home-page");
});
app.get("/home-page", (req, res) => {
  res.render("home-page", {
    currentPath: req.path
  })
})
app.get("/my_health", (req, res) => {
  res.render('my_health', {
    segments: HEALTH_SEGMENTS,
    currentPath: req.path
  })
})

// Render the list of todo lists
app.get("/lists", (req, res) => {
  res.render("lists", {
    todoLists: sortTodoLists(req.session.todoLists),
    currentPath: req.path
  });
});

// Render new todo list page
app.get("/lists/new", (req, res) => {
  res.render("new-list", {
    currentPath: req.path
  });
});

// Create a new todo list
app.post("/lists",
  [
    body("todoListTitle")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The list title is required.")
      .isLength({ max: 100 })
      .withMessage("List title must be between 1 and 100 characters.")
      .custom((title, { req }) => {
        let todoLists = req.session.todoLists;
        let duplicate = todoLists.find(list => list.title === title);
        return duplicate === undefined;
      })
      .withMessage("List title must be unique."),
  ],
  (req, res) => {
    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      res.render("new-list", {
        flash: req.flash(),
        todoListTitle: req.body.todoListTitle,
      });
    } else {
      req.session.todoLists.push(new TodoList(req.body.todoListTitle));
      req.flash("success", "The todo list has been created.");
      res.redirect("/lists");
    }
  }
);

// Render individual todo list and its todos
app.get("/lists/:todoListId", (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId, req.session.todoLists);
  if (todoList === undefined) {
    next(new Error("Not found."));
  } else {
    res.render("list", {
      todoList: todoList,
      todos: sortTodos(todoList),
    });
  }
});

// Toggle completion status of a todo
app.post("/lists/:todoListId/todos/:todoId/toggle", (req, res, next) => {
  let { todoListId, todoId } = { ...req.params };
  let todo = loadTodo(+todoListId, +todoId, req.session.todoLists);
  if (!todo) {
    next(new Error("Not found."));
  } else {
    let title = todo.title;
    if (todo.isDone()) {
      todo.markUndone();
      req.flash("success", `"${title}" marked as NOT done!`);
    } else {
      todo.markDone();
      req.flash("success", `"${title}" marked done.`);
    }

    res.redirect(`/lists/${todoListId}`);
  }
});

// Delete a todo
app.post("/lists/:todoListId/todos/:todoId/destroy", (req, res, next) => {
  let { todoListId, todoId } = { ...req.params };

  let todoList = loadTodoList(+todoListId, req.session.todoLists);
  if (!todoList) {
    next(new Error("Not found."));
  } else {
    let todo = loadTodo(+todoListId, +todoId, req.session.todoLists);
    if (!todo) {
      next(new Error("Not found."));
    } else {
      todoList.removeAt(todoList.findIndexOf(todo));
      req.flash("success", "The todo has been deleted.");
      res.redirect(`/lists/${todoListId}`);
    }
  }
});

// Mark all todos as done
app.post("/lists/:todoListId/complete_all", (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId, req.session.todoLists);
  if (!todoList) {
    next(new Error("Not found."));
  } else {
    todoList.markAllDone();
    req.flash("success", "All todos have been marked as done.");
    res.redirect(`/lists/${todoListId}`);
  }
});

// Create a new todo and add it to the specified list
app.post("/lists/:todoListId/todos",
  [
    body("todoTitle")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The todo title is required.")
      .isLength({ max: 100 })
      .withMessage("Todo title must be between 1 and 100 characters."),
  ],
  (req, res, next) => {
    let todoListId = req.params.todoListId;
    let todoList = loadTodoList(+todoListId, req.session.todoLists);
    if (!todoList) {
      next(new Error("Not found."));
    } else {
      let errors = validationResult(req);
      if (!errors.isEmpty()) {
        errors.array().forEach(message => req.flash("error", message.msg));

        res.render("list", {
          flash: req.flash(),
          todoList: todoList,
          todos: sortTodos(todoList),
          todoTitle: req.body.todoTitle,
        });
      } else {
        let todo = new Todo(req.body.todoTitle);
        todoList.add(todo);
        req.flash("success", "The todo has been created.");
        res.redirect(`/lists/${todoListId}`);
      }
    }
  }
);

// Render edit todo list form
app.get("/lists/:todoListId/edit", (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId, req.session.todoLists);
  if (!todoList) {
    next(new Error("Not found."));
  } else {
    res.render("edit-list", { todoList });
  }
});

// Delete todo list
app.post("/lists/:todoListId/destroy", (req, res, next) => {
  let todoLists = req.session.todoLists;
  let todoListId = +req.params.todoListId;
  let index = todoLists.findIndex(todoList => todoList.id === todoListId);
  if (index === -1) {
    next(new Error("Not found."));
  } else {
    todoLists.splice(index, 1);

    req.flash("success", "Todo list deleted.");
    res.redirect("/lists");
  }
});

// Edit todo list title
app.post("/lists/:todoListId/edit",
  [
    body("todoListTitle")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The list title is required.")
      .isLength({ max: 100 })
      .withMessage("List title must be between 1 and 100 characters.")
      .custom((title, { req }) => {
        let todoLists = req.session.todoLists;
        let duplicate = todoLists.find(list => list.title === title);
        return duplicate === undefined;
      })
      .withMessage("List title must be unique."),
  ],
  (req, res, next) => {
    let todoListId = req.params.todoListId;
    let todoList = loadTodoList(+todoListId, req.session.todoLists);
    if (!todoList) {
      next(new Error("Not found."));
    } else {
      let errors = validationResult(req);
      if (!errors.isEmpty()) {
        errors.array().forEach(message => req.flash("error", message.msg));

        res.render("edit-list", {
          flash: req.flash(),
          todoListTitle: req.body.todoListTitle,
          todoList: todoList,
        });
      } else {
        todoList.setTitle(req.body.todoListTitle);
        req.flash("success", "Todo list updated.");
        res.redirect(`/lists/${todoListId}`);
      }
    }
  }
);

//Render contacts
app.get("/contacts", (req, res) => {
  console.log(req.session.contactData)
  res.render("contacts", {
    contacts: sortContacts(req.session.contactData),
    currentPath: req.path
  });
});

//Add new contact page
app.get("/contacts/new", (req, res) => {
  res.render("new-contact");
});
const validateName = (name, whichName) => {
  return body(name)
    .trim()
    .isLength({ min: 1 })
    .withMessage(`${whichName} name is required.`)
    .bail()
    .isLength({ max: 25 })
    .withMessage(`${whichName} name is too long. Maximum length is 25 characters.`)
    .isAlpha()
    .withMessage(`${whichName} name contains invalid characters. The name must be alphabetic.`);
};

//Add new contact
app.post("/contacts/new",
  [
    validateName("firstName", "First"),
    validateName("lastName", "Last"),

    body("phoneNumber")
      .trim()
      .isLength({ min: 1 })
      .withMessage("Phone number is required.")
      .bail()
      .matches(/^\d\d\d-\d\d\d-\d\d\d\d$/)
      .withMessage("Invalid phone number format. Use ###-###-####."),
  ],
  (req, res, next) => {
    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(error => req.flash("error", error.msg));
      res.render("new-contact", {
        flash: req.flash(),
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        phoneNumber: req.body.phoneNumber,
      });
    } else {
      next();
    }
  },
  (req, res) => {
    let { firstName, lastName, phoneNumber } = req.body
    console.log(firstName);
    req.session.contactData.push(
      new Contact(firstName, lastName, phoneNumber)
    );

    req.flash("success", "New contact added to list!");
    res.redirect("/contacts");
  }
);

//Edit contact page
app.get("/contacts/:contactid/edit", (req, res, next) => {
  let id = req.params.contactid;
  let list = req.session.contactData;
  let current = list.find(elm => elm.id === Number(id))
  if (!current) {
    next(new Error("Not found."));
  } else {
    res.render('edit-contact', { contactid: id, current })
  }
})

//Edit contact
app.post("/contacts/:contactid/edit",
  [
    validateName("firstName", "First"),
    validateName("lastName", "Last"),
    body("phoneNumber")
      .trim()
      .isLength({ min: 1 })
      .withMessage("Phone number is required.")
      .bail()
      .matches(/^\d\d\d-\d\d\d-\d\d\d\d$/)
      .withMessage("Invalid phone number format. Use ###-###-####."),
  ],
  (req, res, next) => {
    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(error => req.flash("error", error.msg));
      res.render("new-contact", {
        flash: req.flash(),
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        phoneNumber: req.body.phoneNumber,
      });
    } else {
      next();
    }
  },
  (req, res) => {
    let id = req.params.contactid;
    let list = req.session.contactData;
    let index = list.findIndex(elm => elm.id === Number(id));
    let updated = list[index];
    if (index === -1) {
      next(new Error("Not found."));
    } else {
      let { firstName, lastName, phoneNumber } = req.body;
      updated.edit(firstName, lastName, phoneNumber);
      req.flash("success", "Contact updated!");
      res.redirect('/contacts')
    }
  }
)

//Delete contact
app.post("/contacts/:contactid/destroy", (req, res, next) => {
  let id = req.params.contactid;
  let list = req.session.contactData;
  let index = list.findIndex(elm => elm.id === Number(id));
  if (index === -1) {
    next(new Error("Not found."));
  } else {
    list.splice(index, 1);

    req.flash("success", "Contact deleted.");
    res.redirect("/contacts");
  }
})

//error handler
app.use((err, req, res, _next) => {
  console.log(err);
  res.status(404).send(err.message);
});

app.listen(port, host, () => {
  console.log(`Todos is listening on port ${port} of ${host}!`);
});
