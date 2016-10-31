var express = require('express');
var swig  = require('swig');
var bodyParser = require('body-parser');
//Recortar imagenes para miniaturas
var jimp = require('jimp');

var app = express();
app.use(express.static('public'));

//Session
var expressSession = require('express-session');
app.use(expressSession({
    secret: 'abcdefg',
    resave: true,
    saveUninitialized: true
}));

//Body parser(valores de los formularios)
app.use(bodyParser.json()); 
app.use(bodyParser.urlencoded({ extended: true })); 

//Cliente de Mongo
var MongoClient = require('mongodb').MongoClient;

//Upload files
var fileUpload = require('express-fileupload');
app.use(fileUpload());

//Crypto
const crypto = require('crypto');
const secreto = 'abcdefg';

// Router - zonaprivada
var zonaprivada = express.Router(); 
zonaprivada.use(function(req, res, next) {
    if ( req.session.usuario ) {
      // dejamos correr la petición
       next();
    } else {
       req.session.destino = req.originalUrl;
       console.log("va a : "+req.session.destino)
       res.redirect("/login");
    }
});

//Aplicar zonaprivada a las siguientes URLs
app.use("/anuncios/publicar",zonaprivada);
app.use("/anuncios/eliminar",zonaprivada);
app.use("/anuncios/publicar",zonaprivada);
app.use("/anuncios/misanuncios",zonaprivada);
app.use("/anuncios/favoritos",zonaprivada);
app.use("/anuncios/favorito",zonaprivada);
app.use("/mensajes",zonaprivada);
app.use("/contacto",zonaprivada);
app.use("/anuncios/reservar",zonaprivada);

//Categorias disponibles(se cargan dinamicamente)
var categorias = ["aves", "mamíferos", "reptiles", "perros", "gatos"]; 

//INDEX
app.get('/', function (req, res) {
    res.redirect("/anuncios/categoria/aves/1");
});

//PUBLICAR ANUNCIO
app.get('/anuncios/publicar', function (req, res) {
    var respuesta = swig.renderFile('vistas/publicar.html', {
        usuario : req.session.usuario,
        categorias : categorias
    });
    res.send(respuesta);
})

app.post('/anuncios/publicar', function (req, res) {
    var nuevoAnuncio = { 
        titulo : req.body.titulo,
        categoria : req.body.categoria,
        descripcion : req.body.descripcion, 
        precio : parseInt(req.body.precio),
        edad : req.body.edad,
        municipio : req.body.municipio,
        tipo : req.body.tipo,
        fecha : getFecha(),
        reserva : "",
        usuario : req.session.usuario
    }
    
    // Abrir el cliente
    MongoClient.connect('mongodb://localhost:27017/aplicacionanuncios', 
    function(err, db) {
        if (err) {
            var respuesta = swig.renderFile('vistas/mensaje.html', {
                usuario : req.session.usuario,
                categorias : categorias,
                error: "Problema al conectarse con la base de datos",
                mensaje : "El anuncio no ha podido publicarse. Inténtelo de nuevo más tarde."
            });
          res.send(respuesta);
        } else {
          //console.log("Conectado al servidor");
          
          var collection = db.collection('anuncios');
          collection.insert(nuevoAnuncio, 
              function (err, result) {
                  db.close();
                  if (err) {
                      var respuesta = swig.renderFile('vistas/mensaje.html', {
                          usuario : req.session.usuario,
                          categorias : categorias,
                          error: "Error al publicar el anuncio",
                          mensaje : "El anuncio no ha podido publicarse. Inténtelo de nuevo."
                      });
                      res.send(respuesta);
                  } else {
                    var anuncioId = result.ops[0]._id;
                    
                    var cont = 1;
                    var files = req.files;
                    var imagenes = [files.imagen1, files.imagen2, files.imagen3, files.imagen4];
                    imagenes.forEach(function(image){
                       if(image.name !== ""){
                            image.mv('public/images/'+anuncioId+'-' + cont + '.jpg', 
                                function(err) {
                                    if (err) {
                                        var respuesta = swig.renderFile('vistas/mensaje.html', {
                                            usuario : req.session.usuario,
                                            categorias : categorias,
                                            error: "Error al publicar el anuncio",
                                            mensaje : "La imagen no se ha subido correctamente. Inténtelo de nuevo."
                                        });
                                        res.send(respuesta);
                                        return;
                                   }
                            });
                            jimp.read(image.data, 
                                function (err, e, c=cont) {
                                    if (err) {
                                        var respuesta = swig.renderFile('vistas/mensaje.html', {
                                            usuario : req.session.usuario,
                                            categorias : categorias,
                                            error: "Error al publicar el anuncio",
                                            mensaje : "La imagen no se ha procesado correctamente. Inténtelo de nuevo."
                                        });
                                        res.send(respuesta);
                                        return;
                                    }
                                    else{
                                        e.resize(jimp.AUTO, 300) 
                                         .quality(80) 
                                         .write('public/images/'+anuncioId+'MIN-' + c + '.jpg');
                                    }
                            });
                           cont++;
                       } 
                    });
                    
                    var respuesta = swig.renderFile('vistas/mensaje.html', {
                        usuario : req.session.usuario,
                        categorias : categorias,
                        exito : "El anuncio se ha publicado correctamente",
                        mensaje : "Su anuncio \""+result.ops[0].titulo +
                        "\" ha sido publicado con éxito. El código del anuncio es: "
                        +result.ops[0]._id
                    });
                    res.send(respuesta); 
                }
            });
        }
      }); 
  });

//ANUNCIOS POR CATEGORIA
app.get('/anuncios/categoria/:nombre/:pag', function (req, res) {
      // Abrir el cliente
      MongoClient.connect('mongodb://localhost:27017/aplicacionanuncios', 
      function(err, db) {
        if (err) {
            var respuesta = swig.renderFile('vistas/mensaje.html', {
                usuario : req.session.usuario,
                categorias : categorias,
                error: "Problema al conectarse con la base de datos",
                mensaje : "No se ha podido acceder a la categoría. Inténtelo de nuevo más tarde."
            });
            res.send(respuesta);
        } else {
            //console.log("Conectado al servidor");

            var collection = db.collection('anuncios');
            var cant = 0;
            collection.find({ categoria : req.params.nombre, reserva : ""})
                    .toArray(function(err, anuncios){
                if (err) {
                    var respuesta = swig.renderFile('vistas/mensaje.html', {
                       usuario : req.session.usuario,
                       categorias : categorias,
                       error: "Error accediendo a la categoría",
                       mensaje : "No se ha podido acceder a la categoría \n\
                       seleccionada. Inténtelo de nuevo."
                    });
                    res.send(respuesta);
               } else
                    cant = anuncios.length;
            });

            var numinicio = (req.params.pag*6)-6;
            collection.find({ categoria : req.params.nombre, reserva : ""}).skip(numinicio).limit(6)
              .toArray(function(err, anuncios){
                  if (err) {
                      var respuesta = swig.renderFile('vistas/mensaje.html', {
                          usuario : req.session.usuario,
                          categorias : categorias,
                          error: "Error accediendo a la categoría",
                          mensaje : "No se ha podido acceder a la categoría \n\
                          seleccionada. Inténtelo de nuevo."
                      });
                      res.send(respuesta);
                  } else {
                      var respuesta = swig.renderFile('vistas/categoria.html', {
                            usuario : req.session.usuario,
                            categorias : categorias,
                            nombre_categoria: req.params.nombre,
                            anuncios: anuncios,
                            cantidad : cant,
                            pagina : parseInt(req.params.pag)
                      });

                      res.send(respuesta);
                  }
                  db.close();
            });
        }   
    });
});

//ANUNCIO COMPLETO
app.get('/anuncio/:id', function (req, res) {
    // Abrir el cliente
    MongoClient.connect('mongodb://localhost:27017/aplicacionanuncios', 
    function(err, db) {
      //console.log("Error:  "+err)
      if (err) {
        var respuesta = swig.renderFile('vistas/mensaje.html', {
            usuario : req.session.usuario,
            categorias : categorias,
            error: "Problema al conectarse con la base de datos",
            mensaje : "No se ha podido acceder al anuncio. Inténtelo de nuevo más tarde."
        });
        res.send(respuesta);
      } else {
        //console.log("Conectado al servidor")
                 
        var collection = db.collection('anuncios');
        var idAnuncio = require('mongodb').ObjectID(req.params.id);
        
        collection.find({ _id : idAnuncio }).toArray(function(err, anuncios){
            if (err) {
                var respuesta = swig.renderFile('vistas/mensaje.html', {
                    usuario : req.session.usuario,
                    categorias : categorias,
                    error: "Error al acceder al anuncio",
                    mensaje : "No se ha podido acceder al anuncio. Pruebe con otro."
                });
                res.send(respuesta); 
            } else {
                var respuesta = swig.renderFile('vistas/anuncio.html', {
                    usuario : req.session.usuario,
                    categorias : categorias,
                    anuncio: anuncios[0]
                });

                res.send(respuesta);
            }
            db.close();
        });
      }
    });
});

//REGISTRO DE USUARIOS
app.get('/registro', function (req, res) {
    var respuesta = swig.renderFile('vistas/registro.html', {
        usuario : req.session.usuario,
        categorias : categorias,
        error: req.query.error
    });
    res.send(respuesta);
});

app.post('/registro', function (req, res) {
    var passwordSeguro = crypto.createHmac('sha256', secreto)
           .update(req.body.password).digest('hex');
    
    var nuevoUsuario = { 
        seudonimo : req.body.seudonimo,
        email : req.body.email,
        password : passwordSeguro,
        favoritos : []
    }
    
    // Abrir el cliente
    MongoClient.connect('mongodb://localhost:27017/aplicacionanuncios', 
    function(err, db) {
        if (err) {
            var respuesta = swig.renderFile('vistas/mensaje.html', {
                usuario : req.session.usuario,
                categorias : categorias,
                error: "Problema al conectarse con la base de datos",
                mensaje : "No se ha podido registrar el usuario. Inténtelo de nuevo más tarde."
            });
            res.send(respuesta);
        }else{
            //console.log("Conectado al servidor");

            var collection = db.collection('usuarios');
            collection.find({ seudonimo: req.body.seudonimo })
                    .toArray(function(err, usuarios){

                if (err || usuarios.length == 0) {
                    collection.find({ email: req.body.email })
                        .toArray(function(err, usuarios){

                        if (err || usuarios.length == 0) {
                            // No encontrado
                            collection.insert(nuevoUsuario, 
                                function (err, result) {
                                    if (err) {
                                        var respuesta = swig.renderFile('vistas/mensaje.html', {
                                            usuario : req.session.usuario,
                                            categorias : categorias,
                                            error: "Error al crear el usuario",
                                            mensaje : "No se ha podido registrar el usuario. Inténtelo de nuevo."
                                        });
                                        res.send(respuesta); 
                                    } else {
                                        var respuesta = swig.renderFile('vistas/mensaje.html', {
                                            usuario : req.session.usuario,
                                            categorias : categorias,
                                            exito: "Usuario registrado correctamente",
                                            mensaje : "Inicie sesión y comience a publicar anuncios :D"
                                        });
                                        res.send(respuesta);   
                                    }
                                    // Cerrar el cliente
                                    db.close();
                                });
                        } else {
                            // Encontrado
                            res.redirect("/registro?error=email");
                        }
                    });
                } else {
                    // Encontrado
                    res.redirect("/registro?error=seudonimo");
                }
            });
        }
    });
});

//LOGIN
app.get('/login', function (req, res) {
    var respuesta = swig.renderFile('vistas/login.html', {
        usuario : req.session.usuario,
        categorias : categorias,
        error: req.query.error
    });
    res.send(respuesta);
});

app.post('/login', function (req, res) {
    var passwordSeguro = crypto.createHmac('sha256', secreto)
           .update(req.body.password).digest('hex');
    
   // Abrir el cliente
    MongoClient.connect('mongodb://localhost:27017/aplicacionanuncios', 
    function(err, db) {
      if (err) {
        var respuesta = swig.renderFile('vistas/mensaje.html', {
            usuario : req.session.usuario,
            categorias : categorias,
            error: "Problema al conectarse con la base de datos",
            mensaje : "No se han podido validar las credenciales. Inténtelo de nuevo más tarde."
        });
        res.send(respuesta); 
      } else {
        var collection = db.collection('usuarios');
        collection.find({ email: req.body.email, password: passwordSeguro })
                .toArray(function(err, usuarios){
                    
            if (err || usuarios.length == 0) {
                // No encontrado
                res.redirect("/login?error=true");
            } else {
                // Encontrado
                req.session.usuario = usuarios[0].seudonimo;
                if ( req.session.destino != null ){
                    res.redirect(req.session.destino);
                } else {
                    res.redirect("/");
                }
            }
            db.close();
        });
      }
    });
});

//LOGOUT
app.get('/logout', function (req, res) {
    req.session.usuario = null;
    res.redirect("/");
});

//MISANUNCIOS
app.get('/anuncios/misanuncios/:pag', function (req, res) {
    // Abrir el cliente
    MongoClient.connect('mongodb://localhost:27017/aplicacionanuncios', 
    function(err, db) {
      if (err) {
        var respuesta = swig.renderFile('vistas/mensaje.html', {
            usuario : req.session.usuario,
            categorias : categorias,
            error: "Problema al conectarse con la base de datos",
            mensaje : "No se han podido acceder a sus anuncios. Inténtelo de nuevo más tarde."
        });
        res.send(respuesta);
      } else {
        //console.log("Conectado al servidor")
                 
        var collection = db.collection('anuncios');
        var cant = 0;
        collection.find({ usuario : req.session.usuario })
                .toArray(function(err, anuncios){
            if (err) {
                 var respuesta = swig.renderFile('vistas/mensaje.html', {
                     usuario : req.session.usuario,
                     categorias : categorias,
                     error: "Problema al buscar anuncios",
                     mensaje : "No se ha podido completar la accion de buscar. Inténtelo de nuevo."
                 });
                 res.send(respuesta);
           } else
               cant = anuncios.length;
        });
        
        var numinicio = (req.params.pag*5)-5;
        collection.find({ usuario : req.session.usuario }).skip(numinicio).limit(5)
                .toArray(function(err, anuncios){
            if (err) {
                var respuesta = swig.renderFile('vistas/mensaje.html', {
                    usuario : req.session.usuario,
                    categorias : categorias,
                    error: "Problema con la sesión",
                    mensaje : "No se han podido acceder a sus anuncios. Inténtelo de nuevo."
                });
                res.send(respuesta);
            } else {
                var respuesta = swig.renderFile('vistas/misanuncios.html', {
                    usuario : req.session.usuario,
                    categorias : categorias,
                    anuncios: anuncios,
                    cantidad : cant,
                    pagina : parseInt(req.params.pag)
                });
                res.send(respuesta);
            }
            db.close();
         });
      }
    });
});

//MODIFICAR ANUNCIO
app.get('/anuncios/modificar/:id', function (req, res) {
    // Abrir el cliente
    MongoClient.connect('mongodb://localhost:27017/aplicacionanuncios', 
    function(err, db) {
      if (err) {
        var respuesta = swig.renderFile('vistas/mensaje.html', {
            usuario : req.session.usuario,
            categorias : categorias,
            error: "Problema al conectarse con la base de datos",
            mensaje : "No se ha podido acceder a modificar el anuncio. Inténtelo de nuevo más tarde."
        });
        res.send(respuesta);
      } else {
        //console.log("Conectado al servidor")
                 
        var collection = db.collection('anuncios');
        var idAnuncio = require('mongodb').ObjectID(req.params.id);
        
        collection.find({ _id : idAnuncio }).toArray(function(err, anuncios){
            if (err) {
                var respuesta = swig.renderFile('vistas/mensaje.html', {
                    usuario : req.session.usuario,
                    categorias : categorias,
                    error: "Problema con el anuncio",
                    mensaje : "No se ha podido acceder a modificar el anuncio. Pruebe con otro anuncio"
                });
                res.send(respuesta);
            } else {
                var respuesta = swig.renderFile('vistas/modificar.html', {
                    usuario : req.session.usuario,
                    categorias : categorias,
                    anuncio: anuncios[0],
                    categorias: categorias
                });
                res.send(respuesta);
            }
            db.close();
         });
      }
    });
});

app.post('/anuncios/modificar/:id', function (req, res) {
    // Datos a modificar
    var nuevosDatos = { 
        titulo : req.body.titulo,
        categoria : req.body.categoria,
        descripcion : req.body.descripcion,
        fecha : getFecha(),
        precio : parseInt(req.body.precio),
        edad : req.body.edad,
        municipio : req.body.municipio,
        tipo: req.body.tipo
    }
    
    // Abrir el cliente
    MongoClient.connect('mongodb://localhost:27017/aplicacionanuncios', 
    function(err, db) {
      if (err) {
        var respuesta = swig.renderFile('vistas/mensaje.html', {
            usuario : req.session.usuario,
            categorias : categorias,
            error: "Problema al conectarse con la base de datos",
            mensaje : "No se ha podido modificar el anuncio. Inténtelo de nuevo más tarde."
        });
        res.send(respuesta);
      } else {
        //console.log("Conectado al servidor");
    
        var collection = db.collection('anuncios');
        
        // Transformar a Mongo ObjectID
        var id = require('mongodb').ObjectID(req.params.id);

        collection.update({ _id : id }, {$set: nuevosDatos }, 
            function (err, result) {
                db.close();
                if (err) {
                    var respuesta = swig.renderFile('vistas/mensaje.html', {
                        usuario : req.session.usuario,
                        categorias : categorias,
                        error: "Problema al modificar el anuncio",
                        mensaje : "No se ha podido modificar el anuncio. Inténtelo de nuevo."
                    });
                    res.send(respuesta);
                } else {
                    var cont = 1;
                    var files = req.files;
                    var imagenes = [files.imagen1, files.imagen2, files.imagen3, files.imagen4];
                    imagenes.forEach(function(image){
                       if(image.name !== ""){
                            image.mv('public/images/'+req.params.id+'-' + cont + '.jpg', 
                                function(err) {
                                    if (err) {
                                        var respuesta = swig.renderFile('vistas/mensaje.html', {
                                            usuario : req.session.usuario,
                                            categorias : categorias,
                                            error: "Error al publicar el anuncio",
                                            mensaje : "La imagen no se ha subido correctamente. Inténtelo de nuevo."
                                        });
                                        res.send(respuesta);
                                        return;
                                   }
                            });
                            jimp.read(image.data, 
                                function (err, e, c=cont) {
                                    if (err) {
                                        var respuesta = swig.renderFile('vistas/mensaje.html', {
                                            usuario : req.session.usuario,
                                            categorias : categorias,
                                            error: "Error al publicar el anuncio",
                                            mensaje : "La imagen no se ha procesado correctamente. Inténtelo de nuevo."
                                        });
                                        res.send(respuesta);
                                        return;
                                    }
                                    else{
                                        e.resize(jimp.AUTO, 300) 
                                         .quality(80) 
                                         .write('public/images/'+req.params.id+'MIN-' + c + '.jpg');
                                    }
                            });
                           cont++;
                       } 
                    });
                    
                    var respuesta = swig.renderFile('vistas/mensaje.html', {
                        usuario : req.session.usuario,
                        categorias : categorias,
                        exito : "El anuncio se ha modificado correctamente",
                        mensaje : "Su anuncio \""+req.body.titulo +
                                "\" ha sido modificado con éxito."
                    });
                    res.send(respuesta);
                }
            });
        }
    }); 
});

//ELIMINAR ANUNCIO
app.get('/anuncios/eliminar/:id', function (req, res) {
    // Abrir el cliente
    MongoClient.connect('mongodb://localhost:27017/aplicacionanuncios', 
    function(err, db) {
      if (err) {
        var respuesta = swig.renderFile('vistas/mensaje.html', {
            usuario : req.session.usuario,
            categorias : categorias,
            error: "Problema al conectarse con la base de datos",
            mensaje : "No se ha podido eliminar el anuncio. Inténtelo de nuevo más tarde."
        });
        res.send(respuesta);
      } else {
        //console.log("Conectado al servidor");
    
        var collection = db.collection('anuncios');
        
        // Transformar a Mongo ObjectID
        var id = require('mongodb').ObjectID(req.params.id);

        collection.remove({ _id : id }, function (err, result) {
            if (err) {
                var respuesta = swig.renderFile('vistas/mensaje.html', {
                    usuario : req.session.usuario,
                    categorias : categorias,
                    error: "Problema al eliminar el anuncio",
                    mensaje : "No se ha podido eliminar el anuncio. Inténtelo de nuevo."
                });
                res.send(respuesta);
            } else {
                res.redirect("/anuncios/misanuncios/1");
            }
            db.close();
        });
      }
    }); 
});

//BUSCAR POR TITULO
app.get('/anuncios/buscar/:pag', function (req, res) {
    // Abrir el cliente
    MongoClient.connect('mongodb://localhost:27017/aplicacionanuncios', 
    function(err, db) {
        if (err) {
            var respuesta = swig.renderFile('vistas/mensaje.html', {
                usuario : req.session.usuario,
                categorias : categorias,
                error: "Problema al conectarse con la base de datos",
                mensaje : "No se ha podido buscar anuncios. Inténtelo de nuevo más tarde."
            });
            res.send(respuesta);
        } else {
            //console.log("Conectado al servidor")

            var collection = db.collection('anuncios');
            var cant = 0;
            collection.find({ titulo : {'$regex': req.query.frase}, reserva : ""})
                    .toArray(function(err, anuncios){
                if (err) {
                     var respuesta = swig.renderFile('vistas/mensaje.html', {
                         usuario : req.session.usuario,
                         categorias : categorias,
                         error: "Problema al buscar anuncios",
                         mensaje : "No se ha podido completar la accion de buscar. Inténtelo de nuevo."
                     });
                     res.send(respuesta);
               } else
                   cant = anuncios.length;
            });

            var numinicio = (req.params.pag*6)-6;
            collection.find({ titulo : {'$regex': req.query.frase}, reserva : ""}).skip(numinicio).limit(6)
                  .toArray(function(err, anuncios){
                if (err) {
                    var respuesta = swig.renderFile('vistas/mensaje.html', {
                        usuario : req.session.usuario,
                        categorias : categorias,
                        error: "Problema al buscar anuncios",
                        mensaje : "No se ha podido completar la accion de buscar. Inténtelo de nuevo."
                    });
                    res.send(respuesta);
                } else {
                    var respuesta = swig.renderFile('vistas/buscar.html', {
                        usuario : req.session.usuario,
                        categorias : categorias,
                        frase: req.query.frase,
                        anuncios: anuncios,
                        cantidad : cant,
                        pagina : parseInt(req.params.pag),
                        avanzada: false
                    });
                    res.send(respuesta);
                }
                db.close();
            });
        }    
    });
});

//BUSQUEDA AVANZADA
app.get('/anuncios/avanzada/:pag', function (req, res) {
    // Abrir el cliente
    MongoClient.connect('mongodb://localhost:27017/aplicacionanuncios', 
    function(err, db) {
        //console.log("Error:  "+err)
        if (err) {
            var respuesta = swig.renderFile('vistas/mensaje.html', {
                usuario : req.session.usuario,
                categorias : categorias,
                error: "Problema al conectarse con la base de datos",
                mensaje : "No se ha podido buscar anuncios. Inténtelo de nuevo más tarde."
            });
            res.send(respuesta);
        } else {
            //console.log("Conectado al servidor")

            var collection = db.collection('anuncios');
            var cant = 0;
            collection.find({ titulo: {'$regex': req.query.frase}, categoria: req.query.categoria, 
                    precio: {'$lte': parseInt(req.query.preciomax), '$gte': parseInt(req.query.preciomin)},
                    reserva : ""})
                    .toArray(function(err, anuncios){
                if (err) {
                     var respuesta = swig.renderFile('vistas/mensaje.html', {
                         usuario : req.session.usuario,
                         categorias : categorias,
                         error: "Problema al buscar anuncios",
                         mensaje : "No se ha podido completar la accion de buscar. Inténtelo de nuevo."
                     });
                     res.send(respuesta);
               } else
                   cant = anuncios.length;
            });
            
            var numinicio = (req.params.pag*6)-6;
            collection.find({ titulo: {'$regex': req.query.frase}, categoria: req.query.categoria, 
                precio: {'$lte': parseInt(req.query.preciomax), '$gte': parseInt(req.query.preciomin)}, 
                reserva : ""})
                    .skip(numinicio).limit(6).toArray(function(err, anuncios){
                if (err) {
                    var respuesta = swig.renderFile('vistas/mensaje.html', {
                        usuario : req.session.usuario,
                        categorias : categorias,
                        error: "Problema al buscar anuncios",
                        mensaje : "No se ha podido completar la accion de buscar. Inténtelo de nuevo."
                    });
                    res.send(respuesta);
              } else {
                  var respuesta = swig.renderFile('vistas/buscar.html', {
                      usuario : req.session.usuario,
                      categorias : categorias,
                      frase: req.query.frase,
                      categoria: req.query.categoria,
                      preciomax: req.query.preciomax,
                      preciomin: req.query.preciomin,
                      anuncios: anuncios,
                      cantidad : cant,
                      pagina : parseInt(req.params.pag),
                      avanzada: true
                  });
                  res.send(respuesta);
              }
              db.close();
          });
        }
    });
});

//ENVIAR MENSAJE A ANUNCIANTE
app.get('/contacto/:receptor/:anuncio', function (req, res) {
    var respuesta = swig.renderFile('vistas/contacto.html', {
        usuario : req.session.usuario,
        receptor: req.params.receptor,
        titulo: req.params.anuncio,
        categorias : categorias
    });
    res.send(respuesta);
})

app.post('/contacto/:receptor', function (req, res) {
    var nuevoMensaje = { 
        emisor : req.session.usuario,
        receptor : req.params.receptor,
        fecha: getFecha(),
        texto: req.body.descripcion
    }
    
    // Abrir el cliente
    MongoClient.connect('mongodb://localhost:27017/aplicacionanuncios', 
    function(err, db) {
        if (err) {
            var respuesta = swig.renderFile('vistas/mensaje.html', {
                usuario : req.session.usuario,
                categorias : categorias,
                error: "Problema al conectarse con la base de datos",
                mensaje : "El mensaje no ha podido enviarse. Inténtelo de nuevo más tarde."
            });
          res.send(respuesta);
        } else {
          //console.log("Conectado al servidor");

          var collection = db.collection('mensajes');
          collection.insert(nuevoMensaje, 
              function (err, result) {
                  db.close();
                  if (err) {
                      var respuesta = swig.renderFile('vistas/mensaje.html', {
                          usuario : req.session.usuario,
                          categorias : categorias,
                          error: "Error al enviar el mensaje",
                          mensaje : "El mensaje no ha podido enviarse. Inténtelo de nuevo."
                      });
                      res.send(respuesta);
                  } else {
                    var respuesta = swig.renderFile('vistas/mensaje.html', {
                        usuario : req.session.usuario,
                        categorias : categorias,
                        exito : "El mensaje se ha enviado correctamente",
                        mensaje : "Su mensaje a \"" + req.params.receptor +
                        "\" ha sido enviado con éxito. El código del mensaje es: "
                        +result.ops[0]._id
                    });
                    res.send(respuesta); 
                }
            });
        }
    }); 
});
  
//LISTADO DE MENSAJES RECIBIDOS
app.get('/mensajes/recibidos', function (req, res) {
    // Abrir el cliente
    MongoClient.connect('mongodb://localhost:27017/aplicacionanuncios', 
    function(err, db) {
      if (err) {
        var respuesta = swig.renderFile('vistas/mensaje.html', {
            usuario : req.session.usuario,
            categorias : categorias,
            error: "Problema al conectarse con la base de datos",
            mensaje : "No se han podido acceder a sus anuncios. Inténtelo de nuevo más tarde."
        });
        res.send(respuesta);
      } else {
        //console.log("Conectado al servidor")
                 
        var collection = db.collection('mensajes');
 
        collection.find({ receptor : req.session.usuario })
                .toArray(function(err, mensajes){
            if (err) {
                var respuesta = swig.renderFile('vistas/mensaje.html', {
                    usuario : req.session.usuario,
                    categorias : categorias,
                    error: "Problema con la sesión",
                    mensaje : "No se han podido acceder a sus mensajes. Inténtelo de nuevo."
                });
                res.send(respuesta);
            } else {
                var respuesta = swig.renderFile('vistas/mensajes.html', {
                    usuario : req.session.usuario,
                    categorias : categorias,
                    mensajes: mensajes,
                    cantidad : mensajes.length,
                    enviados : false
                });
                res.send(respuesta);
            }
            db.close();
         });
      }
    });
});

//LISTADO DE MENSAJES ENVIADOS
app.get('/mensajes/enviados', function (req, res) {
    // Abrir el cliente
    MongoClient.connect('mongodb://localhost:27017/aplicacionanuncios', 
    function(err, db) {
      if (err) {
        var respuesta = swig.renderFile('vistas/mensaje.html', {
            usuario : req.session.usuario,
            categorias : categorias,
            error: "Problema al conectarse con la base de datos",
            mensaje : "No se ha podido acceder a sus anuncios. Inténtelo de nuevo más tarde."
        });
        res.send(respuesta);
      } else {
        //console.log("Conectado al servidor")
                 
        var collection = db.collection('mensajes');
        
        collection.find({ emisor : req.session.usuario })
                .toArray(function(err, mensajes){
            if (err) {
                var respuesta = swig.renderFile('vistas/mensaje.html', {
                    usuario : req.session.usuario,
                    categorias : categorias,
                    error: "Problema con la sesión",
                    mensaje : "No se han podido acceder a sus mensajes. Inténtelo de nuevo."
                });
                res.send(respuesta);
            } else {
                var respuesta = swig.renderFile('vistas/mensajes.html', {
                    usuario : req.session.usuario,
                    categorias : categorias,
                    mensajes: mensajes,
                    cantidad : mensajes.length,
                    enviados : true
                });
                res.send(respuesta);
            }
            db.close();
         });
      }
    });
});

//ELIMINAR MENSAJE
app.get('/mensajes/eliminar', function (req, res) {
    // Abrir el cliente
    MongoClient.connect('mongodb://localhost:27017/aplicacionanuncios', 
    function(err, db) {
      if (err) {
        var respuesta = swig.renderFile('vistas/mensaje.html', {
            usuario : req.session.usuario,
            categorias : categorias,
            error: "Problema al conectarse con la base de datos",
            mensaje : "No se ha podido eliminar el anuncio. Inténtelo de nuevo más tarde."
        });
        res.send(respuesta);
      } else {
        //console.log("Conectado al servidor");
    
        var collection = db.collection('mensajes');
        
        // Transformar a Mongo ObjectID
        var id = require('mongodb').ObjectID(req.query.id);

        collection.remove({ _id : id }, function (err, result) {
            if (err) {
                var respuesta = swig.renderFile('vistas/mensaje.html', {
                    usuario : req.session.usuario,
                    categorias : categorias,
                    error: "Problema al eliminar el mensaje",
                    mensaje : "No se ha podido eliminar el mensaje. Inténtelo de nuevo."
                });
                res.send(respuesta);
            } else {
                res.redirect("/mensajes/recibidos");
            }
            db.close();
        });
      }
    }); 
});

//ANADIR ANUNCIO A FAVORITOS
app.get('/anuncios/favorito/:id', function (req, res) {
    // Abrir el cliente
    MongoClient.connect('mongodb://localhost:27017/aplicacionanuncios', 
    function(err, db) {
      if (err) {
        var respuesta = swig.renderFile('vistas/mensaje.html', {
            usuario : req.session.usuario,
            categorias : categorias,
            error: "Problema al conectarse con la base de datos",
            mensaje : "No se ha podido añadir a favoritos. Inténtelo de nuevo más tarde."
        });
        res.send(respuesta);
      } else {
        //console.log("Conectado al servidor");
    
        var collection = db.collection('usuarios');
        
        collection.update({seudonimo : req.session.usuario}, {'$push':{favoritos : req.params.id}}, 
            function(err, result){
                if (err) {
                    var respuesta = swig.renderFile('vistas/mensaje.html', {
                        usuario : req.session.usuario,
                        categorias : categorias,
                        error: "Error al acceder al anuncio",
                        mensaje : "No se ha podido completar la operación. Inténtelo de nuevo más tarde."
                    });
                    res.send(respuesta); 
                } else {
                    var respuesta = swig.renderFile('vistas/mensaje.html', {
                            usuario : req.session.usuario,
                            categorias : categorias,
                            exito : "El anuncio se ha guardado en favoritos correctamente",
                            mensaje : "El anuncio \"" + req.params.id +
                            "\" ha sido guardado en su listado de favoritos con éxito"
                    });
                    res.send(respuesta); 
                }
                db.close();
            });
        }
    });
});

//LISTADO DE FAVORITOS
app.get('/anuncios/favoritos', function (req, res) {
    // Abrir el cliente
    MongoClient.connect('mongodb://localhost:27017/aplicacionanuncios', 
    function(err, db) {
      if (err) {
        var respuesta = swig.renderFile('vistas/mensaje.html', {
            usuario : req.session.usuario,
            categorias : categorias,
            error: "Problema al conectarse con la base de datos",
            mensaje : "No se han podido acceder a favoritos. Inténtelo de nuevo más tarde."
        });
        res.send(respuesta);
      } else {
        //console.log("Conectado al servidor")
                 
        var collection = db.collection('usuarios');
        var anuncios = db.collection('anuncios');
        var favoritos = new Array();
        
        collection.find({ seudonimo : req.session.usuario }).toArray(function(err, usuario){
            if (err) {
                var respuesta = swig.renderFile('vistas/mensaje.html', {
                    usuario : req.session.usuario,
                    categorias : categorias,
                    error: "Problema con la sesión",
                    mensaje : "No se ha podido acceder a favoritos. Inténtelo de nuevo."
                });
                res.send(respuesta);
            } else {
                var idsobject = new Array();
                for(var i=0; i<usuario[0].favoritos.length; i++)
                    idsobject.push(require('mongodb').ObjectID(usuario[0].favoritos[i]));
                
                anuncios.find({_id : {'$in':idsobject}, reserva : ""}).toArray(function(err, favoritos){
                    if (err) {
                        var respuesta = swig.renderFile('vistas/mensaje.html', {
                            usuario : req.session.usuario,
                            categorias : categorias,
                            error: "Problema con la sesión",
                            mensaje : "No se ha podido acceder a favoritos. Inténtelo de nuevo."
                        });
                        res.send(respuesta);
                    } else {
                        var respuesta = swig.renderFile('vistas/favoritos.html', {
                            usuario : req.session.usuario,
                            categorias : categorias,
                            favoritos: favoritos,
                            cantidad : favoritos.length
                        });
                        res.send(respuesta);
                    }
                    db.close();
                });
            }
         });
      }
    });
});

//ELIMINAR ANUNCIO DE FAVORITOS
app.get('/anuncios/favorito/eliminar/:id', function (req, res) {
    // Abrir el cliente
    MongoClient.connect('mongodb://localhost:27017/aplicacionanuncios', 
    function(err, db) {
      if (err) {
        var respuesta = swig.renderFile('vistas/mensaje.html', {
            usuario : req.session.usuario,
            categorias : categorias,
            error: "Problema al conectarse con la base de datos",
            mensaje : "No se ha podido eliminar el favorito. Inténtelo de nuevo más tarde."
        });
        res.send(respuesta);
      } else {
        //console.log("Conectado al servidor");
    
        var collection = db.collection('usuarios');
        
        collection.update({seudonimo : req.session.usuario}, {'$pull':{favoritos : req.params.id}}, 
            function(err, result){
                if (err) {
                    var respuesta = swig.renderFile('vistas/mensaje.html', {
                        usuario : req.session.usuario,
                        categorias : categorias,
                        error: "Error al acceder al anuncio",
                        mensaje : "No se ha podido completar la operación. Inténtelo de nuevo más tarde."
                    });
                    res.send(respuesta); 
                } else {
                    res.redirect("/anuncios/favoritos"); 
                }
                db.close();
            });
        }
    });
});

//PAGAR RESERVA POR UN ANUNCIO
app.get('/anuncios/reservar/:id', function (req, res) {
    // Abrir el cliente
    MongoClient.connect('mongodb://localhost:27017/aplicacionanuncios', 
    function(err, db) {
      if (err) {
        var respuesta = swig.renderFile('vistas/mensaje.html', {
            usuario : req.session.usuario,
            categorias : categorias,
            error: "Problema al conectarse con la base de datos",
            mensaje : "No se ha podido acceder a la base de datos. Inténtelo de nuevo más tarde."
        });
        res.send(respuesta);
      } else {
        //console.log("Conectado al servidor")
                 
        var collection = db.collection('anuncios');
        var idAnuncio = require('mongodb').ObjectID(req.params.id);
        
        collection.find({ _id : idAnuncio }).toArray(function(err, anuncios){
            if (err) {
                var respuesta = swig.renderFile('vistas/mensaje.html', {
                    usuario : req.session.usuario,
                    categorias : categorias,
                    error: "Problema con el anuncio",
                    mensaje : "No se ha podido acceder a reservar la mascota. Pruebe con otro."
                });
                res.send(respuesta);
            } else {
                var respuesta = swig.renderFile('vistas/reservar.html', {
                    usuario : req.session.usuario,
                    categorias : categorias,
                    anuncio: anuncios[0],
                    categorias: categorias
                });
                res.send(respuesta);
            }
            db.close();
         });
      }
    });
});

app.post('/anuncios/reservar/:id', function (req, res) {
    // Datos a modificar
    var nuevosDatos = { 
        reserva: req.session.usuario
    }
    
    // Abrir el cliente
    MongoClient.connect('mongodb://localhost:27017/aplicacionanuncios', 
    function(err, db) {
      if (err) {
        var respuesta = swig.renderFile('vistas/mensaje.html', {
            usuario : req.session.usuario,
            categorias : categorias,
            error: "Problema al conectarse con la base de datos",
            mensaje : "No se ha podido reservar la mascota. Inténtelo de nuevo más tarde."
        });
        res.send(respuesta);
      } else {
        //console.log("Conectado al servidor");
    
        var collection = db.collection('anuncios');
        
        // Transformar a Mongo ObjectID
        var id = require('mongodb').ObjectID(req.params.id);

        collection.update({ _id : id }, {$set: nuevosDatos }, 
            function (err, result) {
                if (err) {
                    var respuesta = swig.renderFile('vistas/mensaje.html', {
                        usuario : req.session.usuario,
                        categorias : categorias,
                        error: "Problema al reservar la mascota",
                        mensaje : "No se ha podido reservar la mascota. Inténtelo de nuevo."
                    });
                    res.send(respuesta);
                } else {
                    var nuevoMensaje = { 
                        emisor : req.session.usuario,
                        receptor : req.query.propietario,
                        fecha: getFecha(),
                        texto: "EL USUARIO \"" + req.session.usuario + "\" HA PAGADO LA \n\
                                RESERVA DE SU MASCOTA \"" + req.query.titulo + "\". POR FAVOR,\n\
                                PONGASE EN CONTACTO PARA FINALIZAR LA COMPRA. UN SALUDO."
                    }

                    var mensajes = db.collection('mensajes');
                    mensajes.insert(nuevoMensaje, 
                        function (err, result) {
                            db.close();
                            if (err) {
                                var respuesta = swig.renderFile('vistas/mensaje.html', {
                                    usuario : req.session.usuario,
                                    categorias : categorias,
                                    error: "Error al enviar el mensaje",
                                    mensaje : "El mensaje no ha podido enviarse. Inténtelo de nuevo."
                                });
                                res.send(respuesta);
                            } else {
                                var respuesta = swig.renderFile('vistas/mensaje.html', {
                                    usuario : req.session.usuario,
                                    categorias : categorias,
                                    exito : "La mascota se ha reservado correctamente",
                                    mensaje : "La mascota \""+req.query.titulo + "\" ha sido reservada.\n\
                                                Se ha enviado un mensaje al propietario de la mascota \n\
                                                notificando su reserva. Espere a que el propietario \n\
                                                se ponga en contacto para finalizar la compra."
                                });
                                res.send(respuesta); 
                          }
                      });
                }
            });
      }
    }); 
});

function getFecha(){
    var date = new Date();
    var d = date.getDate();
    var m = date.getMonth() + 1;
    var y = date.getFullYear();
    var h = date.getHours();
    var min = date.getMinutes();
    var s = date.getSeconds();
    
    return (d<10?'0':'') + d + "/" + (m<10?'0':'') + m + "/" + y + 
            " " + (h<10?'0':'') + h + ":" + (min<10?'0':'') + min + ":" + 
           (s<10?'0':'') + s;
}

app.listen(8001, function () {
    console.log("Servidor activo");
});