/** 
* Does a simple post request
* @param {categories} url - The string of categories/pillars
* @return {Array} Array of integer categories
*/
export function convertCategoriesToArray(categories){
    var cats_array = categories.split( categories.includes(',') ? ',' : ';');
    var cats_integer_array = cats_array.map( (cat) => {
      switch( cat.toLowerCase().trim() ){
        case 'research and evidence': return 7; break;
        case 'public policy': return 8; break;
        case 'prevention in practice': return 9; break;
      }
    });
    return cats_integer_array;
  }



//get rid of weird characters that come because of excels encoding
export function cleanString(input) {
    var output = "";
    for (var i = 0; i < input.length; i++) {
      if (input.charCodeAt(i) <= 127) {
        output += input.charAt(i);
      }
    }
    return output;
  }
  