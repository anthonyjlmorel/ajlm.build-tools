# Build Tools For Mono Repositories

### Conventions

- Repositories follow the **Yarn Workspaces *standard***
- @types packages are not *compiled*
- All workspace packages are compiled using ``npm run build``, hence this command must be present in their **package.json** file

### Commands

*CMD*: command to execute

*PATH_TO_PKG*: file path to a sub package package.json file

*PATH_TO_REPO_PKG*: file path to repository package.json file

Executes a command on a sub package dependency tree:

`` node index --exec CMD --pkg PATH_TO_PKG ``

Executes a command on a repository packages following dependency tree:

`` node index --exec CMD --repo PATH_TO_REPO_PKG ``

Builds a sub package dependency tree:

`` node index --build --pkg PATH_TO_PKG ``

Builds a repository packages following dependency trees:

`` node index --build --repo PATH_TO_REPO_PKG ``

In build commands, a hash is computed to avoid building a package after successive calls.

### Additional flags:
By Default, commands are executed following the dependencies tree structure of packages, trying to parallelize what can be. If you want to change the behavior:

- ``--tree``: instructs to follow dependencies tree structure
- ``--all``: instructs not to follow dependencies tree structure
- ``--parallel``: instructs to parallelize what can be depending on the context (cannot be used without ``all`` or ``tree``)

```javascript
// Execute build following tree structure dependency by dependency
node index --build --pkg PATH_TO_PKG --tree

// Execute build following tree structure parallelizing siblings
node index --build --pkg PATH_TO_PKG --tree --parallelize

// Execute build package by package (regardless of dependency relations)
node index --build --pkg PATH_TO_PKG --all

// Execute build triggering all packages at the same time (regardless of dependency relations)
node index --build --pkg PATH_TO_PKG --all --parallelize

```

**@TODO**

- detect loops in dependencies Tree before reading specs 

- use a non-recursive version of DFS for huge repositories (sensing a perf issue here)

- make customizable some stuffs like : 
1. build command, do we compile @types, ... see @todo in code.
2. do we force dependants to rebuild if a dependencies changed

- do we implement specific stuff like adding dependencies in sub packages or bumping versions ?