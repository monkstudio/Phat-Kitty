function die() {
    
    arguments.length && log.apply(log, arguments);
    process.exit();
    
}

function log() {
        
    Array.prototype.slice.call(arguments, 0).forEach(m => {
        
        console.log(m);
        
    });
    
}

module.exports = function(grunt){
    "use strict";
        
        // Load libraries
    var _               = require('underscore'),
        bower           = require('bower'),
        path            = require('path'),
        portscanner     = require('portscanner'),
        readline        = require('readline'),
        // Set root of devserver relative to gruntfile.
        pkg             = grunt.file.readJSON('package.json'),
        devserver_root  = grunt.file.expand('/{Volumes,}/devserver').shift(),
        manifest_path   = devserver_root + '/_server/manifest.json',
        manifest        = grunt.file.isFile(manifest_path) ? grunt.file.readJSON(manifest_path) : {},
        global_bower    = grunt.file.readJSON(devserver_root + '/_server/bower.json'),
        // Retrieve list of project folders
        // Set task templates
        tasks               = {
            concurrent      : {
                options : {
                    logConcurrentOutput : true
                },
                project : []
            },
            uglify          : {
                options : {
                    sourceMap               : true,
                    sourceMapIncludeSources : true,
                    sourceMapIn             : '../.tmp/scripts.map',
                    preserveComments        : false,
                    banner                  : '"use strict";\n',
                    nameCache               : '../.tmp/uglify.json'
                }
            },
            concat          : {
                options : {
                    separator       : '',
                    stripBanners    : true
                }
            },
            watch           : {
                options : {}
            },
            sass            : {
                options : {
                    sourceMap       : true,
                    outputStyle     : 'nested',
                    indentedSyntax  : true,
                    precision       : 2
                }
            },
            fontello        : {
                options : {
                    scss    : true,
                    exclude : ['animation.css', 'fontello.css', 'fontello-embedded.css', 'fontello-ie7.css']
                }
            },
            autoprefixer    : {
                options : {
                    map     : true
                }
            },
            clean           : {
                options : {
                    force       : true
                }
            },
            modernizr       : {},
            browserSync     : {
                options : {
                    watchTask   : true
                }
            }
        },
        cli         = {
            standard            : {
                tasks   : ['do_bower', 'do_styles', 'do_scripts', 'start_watches'],
                desc    : 'Runs the default tasks & watches. Recommened for general development.'
            },
            do_styles           : {
                tasks   : ['concat:css', 'sass', 'autoprefixer', 'clean'],
                desc    : 'Concatenates stylesheets from bower components (if any), compiles sass & autoprefixes css.'
            }, 
            do_scripts          : {
                tasks   : ['concat:js', 'uglify', 'clean'],
                desc    : 'Combines & minifies scripts along with installed bower component scripts (if any).'
            }, 
            start_watches       : {
                tasks   : 'concurrent',
                desc    : 'Starts the project watches & a Livereload server for browser autorefresh.'
            },
            install_icons       : {
                task    : ['fontello', 'clean'],
                desc    : 'Install font icons from Fontello. Remember to make sure the Fontello config.json file is placed in the "fonts/icons" directory.'
            },
            do_bower    : {
                tasks   : 'bower',
                desc    : 'Installs components registered in the project\'s bower.json file as well as update existing ones. Current components missing in bower.json will be removed.'
            },
            make_modernizr  : {
                tasks   : 'modernizr',
                desc    : 'Scan project directory and generates a modernizr js file based on detected tests'
            }
        },
        project     = grunt.option('project') || 'base',
        theme       = grunt.option('theme') || 'monk*';

    
    require('load-grunt-tasks')(grunt);
        
    grunt.option('gruntfile', __filename);
    
    if(!project)
        console.error('No project specified or found. Please specify the name of the project using: --project=__NAME__') || process.exit();
    
    let local_bower = grunt.file.expand(devserver_root + '/' + project + '/public_html/*/themes/' + theme + '/bower.json').shift();
        
    // Setup project details and prepare project tasks
    if( local_bower ) {
        
        grunt.file.setBase(path.dirname(local_bower));
        	  
        manifest[project] = _.extend({}, manifest[project], {
            assets      : {
                css     : [],
                js      : [],
                scss    : []
            },
            bower       : _.extend({ name : project, devserver : {} }, global_bower, grunt.file.readJSON(local_bower)),
            config      : {
                cwd                 : path.dirname(local_bower),
                directory           : 'assets',
                analytics           : false,
                ignoredDependencies : [ 'jquery' ]
            }
        });
                
        // Process project asset files
        for(let a in manifest[project].bower.main) {

            let asset   = manifest[project].bower.main[a],
                ext     = path.extname(asset).slice(1);
                            
            manifest[project].assets[ext] = manifest[project].assets[ext] || [];
            
            manifest[project].assets[ext].push(asset);
            
            manifest[project].assets[ext].primary = asset;

        }
        
        
        // Process dev dependency components        
        Object.keys(manifest[project].bower.devDependencies).reverse().forEach(dep => {
           
            let dep_path    = grunt.file.expand('assets/' + dep + '/{bower,package}.json').shift(),
                dep_pkg     = dep_path ? ( manifest[project].bower.overrides[dep] || grunt.file.readJSON(dep_path) ) : { main : [] },
                mainFiles   = typeof dep_pkg.main === 'string' ? [dep_pkg.main] : dep_pkg.main;

            mainFiles.reverse().forEach(asset => {

                let ext = path.extname(asset).slice(1);

                manifest[project].assets[ext] = manifest[project].assets[ext] || [];

                manifest[project].assets[ext].unshift(path.dirname(dep_path) + '/' + asset);

            });
            
        });        
        
        // Add SASS support if enabled
        if(manifest[project].bower.devserver.sass !== false) {            

            tasks.watch['sass'] = {
                files   : ['scss/**/*.{scss,sass}'],
                tasks   : 'do_styles'
            }
                    
            tasks.sass[project] = {
                options : {
                    includePaths    : manifest[project].assets.scss.map(scss => {
                
                        return path.dirname(scss);
                
                    }).concat('../.tmp')
                },
                files   : {}
            }
            
            // Wire css assets to scss files
            tasks.concat.css = {
                dest    : '../.tmp/_bower.scss',
                src     : manifest[project].assets.css.map(css => {

                            let dir     = path.dirname(css),
                                name    = path.basename(css, '.css'),
                                scss    = dir + '/' + name + '.scss';

                            if(grunt.file.exists('scss/' + scss)) 

                                tasks.sass[project].files['../.tmp/' + css] = 'scss/' + scss;

                            else if(manifest[project].assets.scss.indexOf(scss) < 0)
                                return css;

                            return '.noop';

                        }),
                options : {
                    banner  : '/* Compiled on ' + grunt.template.today() + ' */'
                }
            }
               
            tasks.concurrent.project.push('watch:sass');

        }
        
        
        // Autoprefixer
        tasks.autoprefixer[project] = {
            expand  : true,
            flatten : true,
            src     : '../.tmp/**/*.css',
            dest    : './'
        }
        
        
        // Add concat js scripts support
        if(manifest[project].bower.devserver.process_scripts !== false) {
                        
            tasks.watch['js'] = {
                files   : ['js/**/*.js'],
                tasks   : 'do_scripts'
            }   
            
            tasks.concat.js = {
                src     : manifest[project].assets.js,
                dest    : '../.tmp/scripts.js',
                options : {
                    process     : function(src, filepath){
                        return '\n;/*** Source: ' + filepath + ' ***/\n' + src.replace(/(^|\n)[ \t]*('use strict'|"use strict");?\s*/g, '$1');
                    },
                    sourceMap       : true,
                    sourceMapName   : '../.tmp/scripts.map'
                }
            }
            
            tasks.uglify[project] = { files : {} }
            tasks.uglify[project].files['./' + path.basename(manifest[project].assets.js.primary)] = ['../.tmp/scripts.js'];
            
            tasks.concurrent.project.push('watch:js');
        
        }

        
        // Add clean tmp dir task
        tasks.clean[project] = ['../.tmp', './.bowerrc'];
        
        
        // Add Auto Bower Component manager if declared
        if(manifest[project].bower.devserver.manage_bower !== false) {
            
            tasks.watch['bower'] = {
                files       : ['bower.json'],
                tasks       : ['bower']
            }
            
            tasks.concurrent.project.push('watch:bower');
            
        }
        

        // Modernizr
        tasks.modernizr[project] = {
            devFile     : 'remote',
            outputFile  : 'js/modernizr.js',
            files       : {
                src : [
                    'js/**/*.js',
                    '*.css'
                ]
            },
        }
        

        // Add livereload support
        if(manifest[project].bower.devserver.livereload){
            
            tasks.watch['reload'] = {
                files   : [ '**/*.php', '*.css', '*/*.js', '!.tmp/**/*', '!assets/**/*' ], //, 'partials/*.php'
                tasks   : [], //'modernizr:' + p
                options : {
                    livereload  : manifest[project].livereload || false
                }
            }
            
            tasks.concurrent.project.push( 'watch:reload');
            
        }
    
        // Auto icon generation
        tasks.fontello[project] = {
            options : {
                config  : 'fonts/icons/config.json',
                fonts   : 'fonts/icons',
                styles  : 'scss/icons'
            }
        }
        
        
    } else
        console.error('Project: ' + project + ' doesn\'t exist');

    tasks.watch['manifest'] = {
        files   : 'manifest.json',
        tasks   : [],
        options : {
            reload  : true,
            event   : 'deleted'
        }
    }
    //tasks.concurrent.project.push('watch:manifest');
    
    
    grunt.initConfig({
        concurrent      : tasks.concurrent,
        watch           : tasks.watch,
        sass            : tasks.sass,
        autoprefixer    : tasks.autoprefixer,
        fontello        : tasks.fontello,
        modernizr       : tasks.modernizr,
        bower           : tasks.bower,
        clean           : tasks.clean,
        uglify          : tasks.uglify,
        concat          : tasks.concat  
    });

    /* Custom tasks */
    
    grunt.registerTask('bowerrc', function(){
        
        grunt.file.write('./.bowerrc', JSON.stringify(manifest[project].config));
        
    });
    
    // Create task for managing project bower dependencies.
    grunt.registerTask('bower', function(){
                
        let done        = this.async(),
            assets      = grunt.file.expand('assets/*');
        
        grunt.log.writeln("\nLooking for orphan Bower Components to remove...");
                
        // Look for and remove orphan components
        for(let a in assets){
            let asset = path.basename(assets[a]);

            if( !manifest[project].bower.dependencies[asset] && !manifest[project].bower.devDependencies[asset] ){
                grunt.file.delete( assets[a], { force : true });
                grunt.log.ok("Orphan Component '" + asset + "' has been removed.");
            }
            
        }
                
        grunt.log.writeln("\nUpdating Bower Components...");
            
        // Update all components
        bower.commands.update([], { force : true }, manifest[project].config).on('log', function(log){
            
            grunt.log.writeln("LOG: " + log.level + " > " + log.id + " > " + log.message);

        }).on('end', function(){

            grunt.log.ok('\nDone.');
            done();

        }).on('error', function(error){
            
            let old_asset = error.data.endpoint.name;
            
            grunt.log.error(error);
            
            if(error.code === 'ENOTFOUND'){
                
                grunt.log.writeln("\nSearching bower for keyword '" + old_asset + "'...\n");
                
                bower.commands.search(old_asset, manifest[project].config).on('end', function(results) {
                    
                    let cli = readline.createInterface({
                        input     : process.stdin,
                        output    : process.stdout
                    });

                    if(results.length){
                        
                        grunt.log.writeln(results.length + " results found:");
                        
                        for(let r in results)
                            grunt.log.writeln(results[r].name + " (" + results[r].url + ")");
                    }else{
                        grunt.log.error('No results found...');
                        cli.close();
                        done();
                        return;
                    }
                                        
                    cli.question("\nType in a component to install (Warning: This will remove the component from bower.json that could not be found and replace it with the new one):", function(install){

                        let options = {};
                        
                        cli.close();

                        install || done();

                        if(manifest[project].bower.dependencies[old_asset]){
                            
                            options.save = true;
                            delete manifest[project].bower.dependencies[old_asset];
                            
                        }else if(manifest[project].bower.devDependencies[old_asset]){
                            
                            options.saveDev = true;
                            delete manifest[project].bower.devDependencies[old_asset];
                            
                        }

                        grunt.file.write( 'bower.json', JSON.stringify(manifest[project].bower, null, 4));

                        grunt.log.writeln("\nInstalling new component '" + install + "'...\n");
                        
                        bower.commands.install([install], options, manifest[project].config).on('log', function(log){

                            grunt.log.writeln("LOG: " + log.level + " > " + log.id + " > " + log.message);

                        }).on('error', function(error){

                            grunt.log.error("\n" + error);
                            done();

                        }).on('end', function(){

                            grunt.log.ok('\nDone.');
                            done();

                        });
                        
                    });

                });
                
            }else
                done();
            
        });
            
    });
        
    grunt.registerTask('devserver', function(){
            
        var done = this.async();
            
        // Log Server name & version 
        // Change to Fluffy Platypotato says quack/v.x.x
        console.log("\n");
        console.log("                                                                    ✿");
        console.log("                                                                  •̀ ༽☆");
        console.log("                                                                ,.~ ` ~.,");
        console.log("                                                            ___/         \\");
        console.log("   ♥◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌>  (   *   ●      !");
        console.log("   ░                        ♥                         ░    `———,         /~,");
        console.log("   ░          Welcome to " + pkg.name + "/" + pkg.version + "             ░   ,-~,(,,/      (,,/\\  ");
        console.log("   ♥◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌♥  ◜   |            |    ");
        console.log("                                                        |    \\(``,      (`` /   ");
        console.log("                                                         \\     \\.,__    __,/");
        console.log("                                                          `~,.        ,`");
        console.log("                                                              * ~ *` `");
    
        grunt.log.subhead("\n  List of available tasks:\n");
        
        for(let task in cli)
            grunt.log.writeln(grunt.log.table([20, 100], ['  ♥ ' + task, '- ' + cli[task].desc]));
            
        portscanner.findAPortNotInUse(35729, 35779, '192.168.0.77', function(error, port){
            
            let cli = readline.createInterface({
                input     : process.stdin,
                output    : process.stdout
            });
                        
            if(!error){                
                                                                                            
                manifest[project].livereload = port;
                
                grunt.file.write(manifest_path, JSON.stringify(manifest));
                
                cli.question('\n  Please type in a task or a list of tasks to perform, or just press enter to let the Phat Kitty do it for you :) (standard):',
                function(_tasks){
                                        
                    var is_default = !_tasks;
                    
                    _tasks = _tasks.match(/\w+/gi) || 'standard';
                                           
                    if(is_default) {
                        console.log("\n");
                        console.log("    .^====^.   ");
                        console.log("   =( ^--^ )=  <      This extremely Phat Kitty is starting project '" + project + "' for you!... ♥ ♥ ♥");
                        console.log("    /      \\   /~");
                        console.log("  +( |    | )//" );      
                        
                    }
                                                            
                    _tasks.length && grunt.task.run(_tasks);
                    
                    cli.close();
                    done();

                });
                                         
                
            }else{
                console.error(error);
                process.exit();
            }
        
        });
        
    });
    
    grunt.event.on('watch', function(action, filepath, target) {
                
        switch (target) {
                
            case 'sass' :
                console.log("\n");
                console.log(" >____/v=> -- ✭✦♥ Sassy Ducky says a file is " + action + ". Running the compiler... ♥✦✭");
                console.log("  >     \\");
                console.log("   \\____/");
                console.log("     LL\n");
                break;
                
            case 'reload' :
                console.log("\n");
                console.log("    ┌╌┐");
                console.log("   .╌╌╌.")
                console.log("   (  ◕ ▻ -- ✭✦♥ Sergeant Penguin says a file is " + action + ". Refreshing browser! ♥✦✭");
                console.log("  /   ◜ \\");
                console.log(" /   {   }");
                console.log(" \\    ◟ /◞");
                console.log(" \\︿︿︿︿==\n");
                break;

            case 'bower' :
                console.log(target + ": " + filepath + " has " + action);
                console.log("\n o͡͡͡͡͡͡╮(｡>口<｡)╭o͡͡͡͡͡͡    Updating bower!\n");
                break;
        }
    
        
    });
    
    for(let task in cli)
        grunt.registerTask(task, cli[task].tasks);
    
    // Register Tasks
    grunt.registerTask('default', 'devserver');

}