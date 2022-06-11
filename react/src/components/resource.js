<form name="gform" id="gform" enctype="text/plain" action="https://docs.google.com/forms/d/e/1FAIpQLSfNuS4F9fMhlgx94TA0dfN0JJDRIpQwgR77E8pRrWV_HL6Csw/formResponse?" target="hidden_iframe" onsubmit="submitted=true;">
            Last name:<br>
            <input type="text" name="entry.516482001" id="entry.516482001"><br>
            First name:<br>
            <input type="text" name="entry.935697527" id="entry.935697527">
            <br>
            Email:<br>
            <input type="text" name="entry.236876845" id="entry.236876845">
            
            <input type="checkbox" id="entry.517359739" name="entry.517359739" value="DL">
            <label for="DL"> DL</label><br>
            
            <input type="checkbox" id="entry.517359739" name="entry.517359739" value="Python">
            <label for="Python"> Python</label><br>
            
            <input type="checkbox" id="entry.517359739" name="entry.517359739" value="SQL">
            <label for="SQL"> SQL</label><br>

            <input type="submit" value="Submit">
          </form>
          
          <iframe name="hidden_iframe" id="hidden_iframe" style="display:none;" onload="if(submitted) {}"></iframe>

            <script src="assets/js/jquery.min.js"></script>
            <script type="text/javascript">var submitted=false;</script>
            <script type="text/javascript">
                $('#gform').on('submit', function(e) {
                    $('#gform *').fadeOut(2000);
                    $('#gform').prepend('Your submission has been processed...');});
            </script>