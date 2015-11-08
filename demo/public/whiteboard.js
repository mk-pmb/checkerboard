window.addEventListener('load', function() {
    var canvas = document.getElementById('whiteboard');
    
    canvas.width = document.body.clientWidth;
    canvas.height = document.body.clientHeight;
    
    var ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#ff0000';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    
    var stm = new checkerboard.STM('ws://localhost:9999');
    
    var curPath;
    stm.action('init')
      .onReceive(function() {
        if (typeof this.paths === 'undefined')
          this.paths = [];
      });
    
    stm.action('create-path')
      .onReceive(function() {
        curPath = this.paths.push([]) - 1;
      });
    
    stm.action('add-point')
      .onReceive(function(x, y) {
        if (curPath) {
          this.paths[curPath][this.paths[curPath].length] = {'x':x, 'y':y};
        }
      });
      
    stm.action('end-path')
      .onReceive(function(x, y) {
        curPath = null;
      });
    
    stm.init(function(store) {
      store.sendAction('init');
      
      canvas.addEventListener('mousedown', function(e) {
        store.sendAction('create-path');
        store.sendAction('add-point', e.pageX - canvas.offsetLeft, e.pageY - canvas.offsetTop);
      });
      
      canvas.addEventListener('mousemove', function(e) {
        store.sendAction('add-point', e.pageX - canvas.offsetLeft, e.pageY - canvas.offsetTop);
      });
      
      canvas.addEventListener('mouseup', function(e) {
        store.sendAction('end-path');
      });
      
      canvas.addEventListener('mouseleave', function(e) {
        store.sendAction('end-path');
      });
      
      store.paths.addObserver(function(newValue, oldValue) {
        for (var i = 0; i < newValue.length; i++)
          drawPath(newValue[i], oldValue && oldValue[i] ? oldValue[i].length : 0);
      });
    });
  
    function drawPath(path, startingPoint) {
      for (var i = startingPoint || 0; i < path.length; i++) {
        ctx.beginPath();
        if (path[i - 1])
          ctx.moveTo(path[i - 1].x, path[i - 1].y);
        else
          ctx.moveTo(path[i].x - 1, path[i].y);
          
        ctx.lineTo(path[i].x, path[i].y);
        ctx.closePath();
        ctx.stroke();
      }
    }
  
  });
